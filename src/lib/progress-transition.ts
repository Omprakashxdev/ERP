import { prisma } from "@/lib/prisma";
import { Prisma, ProgressActivityStatus, ProgressSiteStatus } from "@prisma/client";
import { z } from "zod";
import { progressActivityTransitionSchema } from "@/lib/schemas/progress-activity";

/**
 * Shared server-authoritative activity status transition service.
 *
 * This is the ONLY write path for activity progress — used by the ERP
 * server action (session-authenticated) and the mobile API (bearer-token
 * authenticated, per-site assignment checked). Both callers authenticate
 * the user and authorize scope before calling; this service enforces the
 * data-level invariants inside a single transaction:
 *
 *  - every ancestor must be active (room/flat/floor/wing isActive,
 *    site not ARCHIVED, checklist and activity active)
 *  - optimistic revision check (expectedRevision) with an atomic
 *    conditional updateMany, so a concurrent write can never be lost
 *  - status update + history insert commit atomically
 *  - eventId idempotency: replays return the recorded result without
 *    double-applying, and a reused eventId carrying different contents
 *    (different activity, user or target status) is rejected
 */

export type TransitionErrorCode =
  | "NOT_FOUND"
  | "INACTIVE"
  | "STALE"
  | "EVENT_CONFLICT";

export class ProgressTransitionError extends Error {
  constructor(
    public readonly code: TransitionErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ProgressTransitionError";
  }
}

export interface TransitionOutcome {
  id: string;
  status: ProgressActivityStatus;
  revision: number;
  alreadyApplied: boolean;
  roomId: string;
  siteId: string;
}

export type ParsedTransition = z.infer<typeof progressActivityTransitionSchema>;

const chainSelect = {
  id: true,
  status: true,
  revision: true,
  isActive: true,
  roomChecklist: {
    select: {
      isActive: true,
      roomId: true,
      room: {
        select: {
          isActive: true,
          flat: {
            select: {
              isActive: true,
              floor: {
                select: {
                  isActive: true,
                  wing: {
                    select: {
                      isActive: true,
                      siteId: true,
                      site: { select: { status: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

type ActivityChain = Prisma.ProgressRoomActivityGetPayload<{
  select: typeof chainSelect;
}>;

/** Every ancestor must be active for a progress mutation to proceed. */
export function assertActivityChainActive(chain: ActivityChain) {
  const cl = chain.roomChecklist;
  const room = cl.room;
  const { flat } = room;
  const { floor } = flat;
  const { wing } = floor;
  if (!chain.isActive) {
    throw new ProgressTransitionError(
      "INACTIVE",
      "This activity has been deactivated."
    );
  }
  if (!cl.isActive) {
    throw new ProgressTransitionError(
      "INACTIVE",
      "This room's checklist is no longer active."
    );
  }
  if (!room.isActive) {
    throw new ProgressTransitionError(
      "INACTIVE",
      "This room has been deactivated."
    );
  }
  if (!flat.isActive) {
    throw new ProgressTransitionError(
      "INACTIVE",
      "The parent flat has been deactivated."
    );
  }
  if (!floor.isActive) {
    throw new ProgressTransitionError(
      "INACTIVE",
      "The parent floor has been deactivated."
    );
  }
  if (!wing.isActive) {
    throw new ProgressTransitionError(
      "INACTIVE",
      "The parent wing has been deactivated."
    );
  }
  if (wing.site.status === ProgressSiteStatus.ARCHIVED) {
    throw new ProgressTransitionError(
      "INACTIVE",
      "The site has been archived."
    );
  }
}

export async function applyActivityStatusTransition(
  userId: string,
  parsed: ParsedTransition
): Promise<TransitionOutcome> {
  return prisma.$transaction(async (tx) => {
    const activity = await tx.progressRoomActivity.findUnique({
      where: { id: parsed.roomActivityId },
      select: chainSelect,
    });
    if (!activity) {
      throw new ProgressTransitionError("NOT_FOUND", "Activity not found.");
    }
    const siteId = activity.roomChecklist.room.flat.floor.wing.siteId;

    // Idempotent replay — the same event was already recorded. The event
    // id must be bound to the same activity, the same user and the same
    // requested status; a recycled eventId with different contents is a
    // conflict, not a silent success.
    const seen = await tx.progressActivityHistory.findUnique({
      where: { eventId: parsed.eventId },
      select: {
        roomActivityId: true,
        changedById: true,
        newStatus: true,
      },
    });
    if (seen) {
      const bound =
        seen.roomActivityId === activity.id &&
        seen.changedById === userId &&
        seen.newStatus === parsed.status;
      if (!bound) {
        throw new ProgressTransitionError(
          "EVENT_CONFLICT",
          "eventId was already used with different request contents.",
          {
            roomActivityId: seen.roomActivityId,
            newStatus: seen.newStatus,
          }
        );
      }
      return {
        id: activity.id,
        status: activity.status,
        revision: activity.revision,
        alreadyApplied: true,
        roomId: activity.roomChecklist.roomId,
        siteId,
      };
    }

    assertActivityChainActive(activity);

    if (activity.revision !== parsed.expectedRevision) {
      throw new ProgressTransitionError(
        "STALE",
        `Stale revision — activity was updated by someone else. ` +
          `Expected revision ${parsed.expectedRevision}, current is ${activity.revision}.`,
        {
          currentRevision: activity.revision,
          currentStatus: activity.status,
        }
      );
    }

    // Atomic conditional write — fails if revision moved between the read
    // and the write inside this transaction.
    const written = await tx.progressRoomActivity.updateMany({
      where: { id: activity.id, revision: parsed.expectedRevision },
      data: {
        status: parsed.status,
        revision: { increment: 1 },
        updatedById: userId,
      },
    });
    if (written.count !== 1) {
      const cur = await tx.progressRoomActivity.findUnique({
        where: { id: activity.id },
        select: { revision: true, status: true },
      });
      throw new ProgressTransitionError(
        "STALE",
        `Stale revision — activity was updated by someone else. ` +
          `Expected revision ${parsed.expectedRevision}, current is ${cur?.revision ?? "unknown"}.`,
        { currentRevision: cur?.revision, currentStatus: cur?.status }
      );
    }

    await tx.progressActivityHistory.create({
      data: {
        roomActivityId: activity.id,
        eventId: parsed.eventId,
        previousStatus: activity.status,
        newStatus: parsed.status,
        changedById: userId,
        notes: parsed.notes ?? null,
      },
    });

    return {
      id: activity.id,
      status: parsed.status,
      revision: activity.revision + 1,
      alreadyApplied: false,
      roomId: activity.roomChecklist.roomId,
      siteId,
    };
  });
}

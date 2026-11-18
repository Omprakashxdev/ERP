import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rollupRooms } from "@/lib/progress-rollup";
import { roomsInScope } from "@/lib/progress-scopes";
import {
  apiError,
  apiOk,
  parseJson,
  requireMobileUser,
  requireSiteScope,
  siteIdOf,
} from "@/lib/mobile/api";
import { mobileStatusUpdateSchema } from "@/lib/schemas/mobile";
import {
  applyActivityStatusTransition,
  ProgressTransitionError,
} from "@/lib/progress-transition";
import { logAuditEvent } from "@/lib/audit";

const paramsSchema = z.object({ activityId: z.string().min(1) });

/**
 * PATCH /api/mobile/v1/activities/:activityId/status
 * { status, expectedRevision, eventId, note? }
 *
 * The only mobile write path for progress — delegates to the shared
 * transition service after authentication + per-site canUpdate check.
 * Stale revisions return 409 with safe current state for client-side
 * conflict resolution; replays of the same eventId are idempotent.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  const { activityId } = paramsSchema.parse(await params);
  const siteId = await siteIdOf("activity", activityId);
  if (!siteId) return apiError(404, "NOT_FOUND", "Activity not found.");

  const scope = await requireSiteScope(user.id, siteId, { write: true });
  if (!scope.ok) return scope.res;

  const parsed = await parseJson(req, mobileStatusUpdateSchema);
  if (!parsed.ok) return parsed.res;
  const { status, expectedRevision, eventId, note } = parsed.data;

  try {
    const result = await applyActivityStatusTransition(user.id, {
      roomActivityId: activityId,
      status,
      expectedRevision,
      eventId,
      notes: note ?? null,
    });

    await logAuditEvent({
      userId: user.id,
      action: "mobile-status-change",
      entity: "ProgressRoomActivity",
      entityId: result.id,
      metadata: {
        status,
        eventId,
        siteId: result.siteId,
        alreadyApplied: result.alreadyApplied,
      },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    const roomProgress = rollupRooms(
      await roomsInScope({ roomId: result.roomId })
    );

    return apiOk({
      id: result.id,
      status: result.status,
      revision: result.revision,
      eventId,
      alreadyApplied: result.alreadyApplied,
      roomProgress,
    });
  } catch (e) {
    if (e instanceof ProgressTransitionError) {
      if (e.code === "STALE" || e.code === "EVENT_CONFLICT") {
        return apiError(409, e.code, e.message, {
          current: e.details ?? null,
        });
      }
      if (e.code === "INACTIVE") {
        return apiError(403, "INACTIVE", e.message);
      }
      return apiError(404, "NOT_FOUND", e.message);
    }
    throw e;
  }
}

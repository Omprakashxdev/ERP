import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { rollupRooms } from "@/lib/progress-rollup";
import { roomsInScope } from "@/lib/progress-scopes";
import {
  apiError,
  apiOk,
  requireMobileUser,
  requireSiteScope,
  siteIdOf,
} from "@/lib/mobile/api";
import { z } from "zod";

const paramsSchema = z.object({ roomId: z.string().min(1) });

/**
 * GET /api/mobile/v1/rooms/:roomId/activities — active checklist snapshot
 * with status + revision for every activity (revision is the concurrency
 * token required by the status PATCH).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { roomId } = paramsSchema.parse(await params);
  const siteId = await siteIdOf("room", roomId);
  if (!siteId) return apiError(404, "NOT_FOUND", "Room not found.");
  const scope = await requireSiteScope(auth.user.id, siteId);
  if (!scope.ok) return scope.res;

  const room = await prisma.progressRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      roomName: true,
      roomType: true,
      isActive: true,
      checklists: {
        where: { isActive: true },
        take: 1,
        select: {
          id: true,
          templateVersion: true,
          assignedAt: true,
          template: { select: { name: true } },
          activities: {
            where: { isActive: true },
            orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              activityNameSnapshot: true,
              descriptionSnapshot: true,
              displayOrder: true,
              status: true,
              revision: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
  if (!room) return apiError(404, "NOT_FOUND", "Room not found.");

  const checklist = room.checklists[0] ?? null;
  const progress = rollupRooms(await roomsInScope({ roomId }));

  return apiOk({
    room: {
      id: room.id,
      roomName: room.roomName,
      roomType: room.roomType,
      isActive: room.isActive,
    },
    checklist: checklist
      ? {
          id: checklist.id,
          templateName: checklist.template.name,
          snapshotVersion: checklist.templateVersion,
          assignedAt: checklist.assignedAt.toISOString(),
        }
      : null,
    progress,
    permissions: scope.assignment,
    activities: (checklist?.activities ?? []).map((a) => ({
      id: a.id,
      name: a.activityNameSnapshot,
      description: a.descriptionSnapshot,
      displayOrder: a.displayOrder,
      status: a.status,
      revision: a.revision,
      updatedAt: a.updatedAt.toISOString(),
    })),
  });
}

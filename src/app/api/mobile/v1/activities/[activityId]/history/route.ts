import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiOk,
  requireMobileUser,
  requireSiteScope,
  siteIdOf,
} from "@/lib/mobile/api";
import { z } from "zod";

const paramsSchema = z.object({ activityId: z.string().min(1) });

/**
 * GET /api/mobile/v1/activities/:activityId/history — chronological
 * status transitions + notes for one activity (newest first).
 * Read-only; history rows are never rewritten or rebased.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { activityId } = paramsSchema.parse(await params);
  const siteId = await siteIdOf("activity", activityId);
  if (!siteId) return apiError(404, "NOT_FOUND", "Activity not found.");

  const scope = await requireSiteScope(auth.user.id, siteId);
  if (!scope.ok) return scope.res;

  const history = await prisma.progressActivityHistory.findMany({
    where: { roomActivityId: activityId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      previousStatus: true,
      newStatus: true,
      notes: true,
      createdAt: true,
      changedBy: { select: { name: true, email: true } },
    },
  });

  return apiOk({
    items: history.map((h) => ({
      id: h.id,
      previousStatus: h.previousStatus,
      newStatus: h.newStatus,
      note: h.notes,
      createdAt: h.createdAt.toISOString(),
      changedBy: h.changedBy.name ?? h.changedBy.email,
    })),
  });
}

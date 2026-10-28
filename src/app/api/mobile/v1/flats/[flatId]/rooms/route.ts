import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { rollupByKey } from "@/lib/progress-rollup";
import { roomsInScope } from "@/lib/progress-scopes";
import {
  apiError,
  apiOk,
  requireMobileUser,
  requireSiteScope,
  siteIdOf,
} from "@/lib/mobile/api";
import { z } from "zod";

const paramsSchema = z.object({ flatId: z.string().min(1) });

/** GET /api/mobile/v1/flats/:flatId/rooms — rooms + per-room progress. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ flatId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { flatId } = paramsSchema.parse(await params);
  const siteId = await siteIdOf("flat", flatId);
  if (!siteId) return apiError(404, "NOT_FOUND", "Flat not found.");
  const scope = await requireSiteScope(auth.user.id, siteId);
  if (!scope.ok) return scope.res;

  const [rooms, scoped] = await Promise.all([
    prisma.progressRoom.findMany({
      where: { flatId },
      orderBy: [{ displayOrder: "asc" }, { roomName: "asc" }],
      select: {
        id: true,
        roomName: true,
        roomType: true,
        displayOrder: true,
        isActive: true,
      },
    }),
    roomsInScope({ flatId }),
  ]);
  const progressByRoom = rollupByKey(scoped, (r) => r.id);

  return apiOk({
    permissions: scope.assignment,
    items: rooms.map((r) => ({
      id: r.id,
      roomName: r.roomName,
      roomType: r.roomType,
      displayOrder: r.displayOrder,
      isActive: r.isActive,
      progress: progressByRoom.get(r.id) ?? null,
    })),
  });
}

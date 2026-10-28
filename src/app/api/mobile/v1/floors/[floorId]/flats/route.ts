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

const paramsSchema = z.object({ floorId: z.string().min(1) });

/** GET /api/mobile/v1/floors/:floorId/flats — flats + per-flat progress. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ floorId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { floorId } = paramsSchema.parse(await params);
  const siteId = await siteIdOf("floor", floorId);
  if (!siteId) return apiError(404, "NOT_FOUND", "Floor not found.");
  const scope = await requireSiteScope(auth.user.id, siteId);
  if (!scope.ok) return scope.res;

  const [flats, rooms] = await Promise.all([
    prisma.progressFlat.findMany({
      where: { floorId },
      orderBy: [{ displayOrder: "asc" }, { flatNumber: "asc" }],
      select: {
        id: true,
        flatNumber: true,
        flatType: true,
        displayOrder: true,
        isActive: true,
        _count: { select: { rooms: true } },
      },
    }),
    roomsInScope({ floorId }),
  ]);
  const progressByFlat = rollupByKey(rooms, (r) => r.flatId);

  return apiOk({
    items: flats.map((f) => ({
      id: f.id,
      flatNumber: f.flatNumber,
      flatType: f.flatType,
      displayOrder: f.displayOrder,
      isActive: f.isActive,
      roomsCount: f._count.rooms,
      progress: progressByFlat.get(f.id) ?? null,
    })),
  });
}

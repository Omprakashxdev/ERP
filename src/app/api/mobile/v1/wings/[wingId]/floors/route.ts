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

const paramsSchema = z.object({ wingId: z.string().min(1) });

/** GET /api/mobile/v1/wings/:wingId/floors — floors + per-floor progress. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wingId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { wingId } = paramsSchema.parse(await params);
  const siteId = await siteIdOf("wing", wingId);
  if (!siteId) return apiError(404, "NOT_FOUND", "Wing not found.");
  const scope = await requireSiteScope(auth.user.id, siteId);
  if (!scope.ok) return scope.res;

  const [floors, rooms] = await Promise.all([
    prisma.progressFloor.findMany({
      where: { wingId },
      orderBy: [{ displayOrder: "asc" }, { floorIdentifier: "asc" }],
      select: {
        id: true,
        floorIdentifier: true,
        displayName: true,
        displayOrder: true,
        isActive: true,
        _count: { select: { flats: true } },
      },
    }),
    roomsInScope({ wingId }),
  ]);
  const progressByFloor = rollupByKey(rooms, (r) => r.flat.floorId);

  return apiOk({
    items: floors.map((f) => ({
      id: f.id,
      floorIdentifier: f.floorIdentifier,
      displayName: f.displayName,
      displayOrder: f.displayOrder,
      isActive: f.isActive,
      flatsCount: f._count.flats,
      progress: progressByFloor.get(f.id) ?? null,
    })),
  });
}

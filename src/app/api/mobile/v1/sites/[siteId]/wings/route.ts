import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { rollupByKey } from "@/lib/progress-rollup";
import { roomsInScope } from "@/lib/progress-scopes";
import { apiOk, requireMobileUser, requireSiteScope } from "@/lib/mobile/api";
import { z } from "zod";

const paramsSchema = z.object({ siteId: z.string().min(1) });

/** GET /api/mobile/v1/sites/:siteId/wings — wings + per-wing progress. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { siteId } = paramsSchema.parse(await params);
  const scope = await requireSiteScope(auth.user.id, siteId);
  if (!scope.ok) return scope.res;

  const [wings, rooms] = await Promise.all([
    prisma.progressWing.findMany({
      where: { siteId },
      orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        displayOrder: true,
        isActive: true,
        _count: { select: { floors: true } },
      },
    }),
    roomsInScope({ siteId }),
  ]);
  const progressByWing = rollupByKey(rooms, (r) => r.flat.floor.wingId);

  return apiOk({
    items: wings.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      description: w.description,
      displayOrder: w.displayOrder,
      isActive: w.isActive,
      floorsCount: w._count.floors,
      progress: progressByWing.get(w.id) ?? null,
    })),
  });
}

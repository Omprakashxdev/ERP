import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { rollupRooms } from "@/lib/progress-rollup";
import { roomsInScope } from "@/lib/progress-scopes";
import { apiError, apiOk, requireMobileUser, requireSiteScope } from "@/lib/mobile/api";
import { z } from "zod";

const paramsSchema = z.object({ siteId: z.string().min(1) });

/** GET /api/mobile/v1/sites/:siteId — site detail + progress + child counts. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { siteId } = paramsSchema.parse(await params);
  const scope = await requireSiteScope(auth.user.id, siteId);
  if (!scope.ok) return scope.res;

  const site = await prisma.progressSite.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      siteCode: true,
      siteName: true,
      status: true,
      description: true,
      address: true,
      city: true,
      state: true,
      coverImagePath: true,
      _count: { select: { wings: true } },
    },
  });
  if (!site) return apiError(404, "NOT_FOUND", "Site not found.");

  const rooms = await roomsInScope({ siteId });
  return apiOk({
    site: { ...site, wingsCount: site._count.wings, _count: undefined },
    permissions: scope.assignment,
    progress: rollupRooms(rooms),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rollupRooms } from "@/lib/progress-rollup";
import { roomsInScope } from "@/lib/progress-scopes";
import { apiOk, pageParams, requireMobileUser } from "@/lib/mobile/api";

/**
 * GET /api/mobile/v1/sites?page=&pageSize=
 * Sites the authenticated user is assigned to (canView), each with its
 * server-computed progress rollup.
 */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const paging = pageParams(req, { pageSize: 50 });
  if (paging instanceof NextResponse) return paging;
  const { skip, take, page, pageSize } = paging;

  const [total, assignments] = await Promise.all([
    prisma.progressSiteAssignment.count({
      where: { userId: auth.user.id, isActive: true, canView: true },
    }),
    prisma.progressSiteAssignment.findMany({
      where: { userId: auth.user.id, isActive: true, canView: true },
      select: {
        siteId: true,
        canUpdate: true,
        site: {
          select: {
            id: true,
            siteCode: true,
            siteName: true,
            status: true,
            city: true,
            state: true,
            coverImagePath: true,
          },
        },
      },
      orderBy: { site: { siteName: "asc" } },
      skip,
      take,
    }),
  ]);

  const items = await Promise.all(
    assignments.map(async (a) => ({
      id: a.site.id,
      siteCode: a.site.siteCode,
      siteName: a.site.siteName,
      status: a.site.status,
      city: a.site.city,
      state: a.site.state,
      coverImagePath: a.site.coverImagePath,
      coverUrl: a.site.coverImagePath
        ? `/api/mobile/v1/sites/${a.site.id}/cover`
        : null,
      canUpdate: a.canUpdate,
      progress: rollupRooms(await roomsInScope({ siteId: a.siteId })),
    }))
  );

  return apiOk({ items, page: { page, pageSize, total } });
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { rollupByKey } from "@/lib/progress-rollup";
import { roomsInScope } from "@/lib/progress-scopes";
import { apiOk, requireMobileUser } from "@/lib/mobile/api";

/**
 * GET /api/mobile/v1/progress/summary — one rollup per assigned site plus
 * a cross-site total (raw counts, server-authoritative).
 */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const assignments = await prisma.progressSiteAssignment.findMany({
    where: { userId: auth.user.id, isActive: true, canView: true },
    select: {
      siteId: true,
      site: { select: { siteCode: true, siteName: true, status: true } },
    },
    orderBy: { site: { siteName: "asc" } },
  });

  const siteIds = assignments.map((a) => a.siteId);
  const rooms = siteIds.length
    ? await prisma.progressRoom.findMany({
        where: {
          flat: { floor: { wing: { siteId: { in: siteIds } } } },
        },
        select: {
          id: true,
          flatId: true,
          flat: {
            select: {
              floorId: true,
              floor: {
                select: {
                  wingId: true,
                  wing: { select: { siteId: true } },
                },
              },
            },
          },
          checklists: {
            where: { isActive: true },
            take: 1,
            select: {
              activities: {
                where: { isActive: true },
                select: { status: true },
              },
            },
          },
        },
      })
    : [];

  const bySite = rollupByKey(rooms, (r) => r.flat.floor.wing.siteId);

  return apiOk({
    items: assignments.map((a) => ({
      siteId: a.siteId,
      siteCode: a.site.siteCode,
      siteName: a.site.siteName,
      siteStatus: a.site.status,
      progress:
        bySite.get(a.siteId) ?? {
          totalActivities: 0,
          completedActivities: 0,
          configuredRooms: 0,
          unconfiguredRooms: 0,
          percent: null,
        },
    })),
  });
}

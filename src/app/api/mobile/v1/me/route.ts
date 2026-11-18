import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiOk, requireMobileUser } from "@/lib/mobile/api";

/** GET /api/mobile/v1/me — profile + assignment summary for the token user. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  const assignments = await prisma.progressSiteAssignment.findMany({
    where: { userId: user.id, isActive: true },
    select: {
      siteId: true,
      canView: true,
      canUpdate: true,
      site: { select: { siteCode: true, siteName: true, status: true } },
    },
    orderBy: { assignedAt: "desc" },
  });

  return apiOk({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    assignments: assignments.map((a) => ({
      siteId: a.siteId,
      siteCode: a.site.siteCode,
      siteName: a.site.siteName,
      siteStatus: a.site.status,
      canView: a.canView,
      canUpdate: a.canUpdate,
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  requireMobileUser,
  requireSiteScope,
} from "@/lib/mobile/api";
import { readPhotoFile, sniffImageType, mimeFor } from "@/lib/progress-photos";

const paramsSchema = z.object({ siteId: z.string().min(1) });

/**
 * GET /api/mobile/v1/sites/:siteId/cover — bearer-authenticated cover
 * bytes for assigned staff only.
 */
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
    select: { coverImagePath: true },
  });
  if (!site?.coverImagePath) {
    return apiError(404, "NOT_FOUND", "Site has no cover image.");
  }

  const bytes = await readPhotoFile(site.coverImagePath);
  if (!bytes) {
    return apiError(404, "NOT_FOUND", "Cover content is unavailable.");
  }
  const type = sniffImageType(bytes);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type ? mimeFor(type) : "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

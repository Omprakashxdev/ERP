import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  requireMobileUser,
  requireSiteScope,
} from "@/lib/mobile/api";
import { readPhotoFile } from "@/lib/progress-photos";

const paramsSchema = z.object({ photoId: z.string().min(1) });

/**
 * GET /api/mobile/v1/photos/:photoId/content — authenticated byte stream.
 * The storageKey is validated and realpath-contained before reading, so
 * no user input ever reaches the filesystem path.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { photoId } = paramsSchema.parse(await params);
  const photo = await prisma.progressPhoto.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      siteId: true,
      storageKey: true,
      mimeType: true,
      deletedAt: true,
    },
  });
  if (!photo || photo.deletedAt) {
    return apiError(404, "NOT_FOUND", "Photo not found.");
  }
  const scope = await requireSiteScope(auth.user.id, photo.siteId);
  if (!scope.ok) return scope.res;

  const bytes = await readPhotoFile(photo.storageKey);
  if (!bytes) {
    return apiError(404, "NOT_FOUND", "Photo content is unavailable.");
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

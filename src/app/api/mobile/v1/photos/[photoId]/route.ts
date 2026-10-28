import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiOk,
  requireMobileUser,
  requireSiteScope,
} from "@/lib/mobile/api";
import { logAuditEvent } from "@/lib/audit";

const paramsSchema = z.object({ photoId: z.string().min(1) });

async function loadPhoto(photoId: string) {
  return prisma.progressPhoto.findUnique({
    where: { id: photoId },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
}

/** GET /api/mobile/v1/photos/:photoId — photo metadata. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { photoId } = paramsSchema.parse(await params);
  const photo = await loadPhoto(photoId);
  if (!photo || photo.deletedAt) {
    return apiError(404, "NOT_FOUND", "Photo not found.");
  }
  const scope = await requireSiteScope(auth.user.id, photo.siteId);
  if (!scope.ok) return scope.res;

  return apiOk({
    photo: {
      id: photo.id,
      targetType: photo.targetType,
      siteId: photo.siteId,
      flatId: photo.flatId,
      roomId: photo.roomId,
      roomActivityId: photo.roomActivityId,
      mimeType: photo.mimeType,
      fileSize: photo.fileSize,
      caption: photo.caption,
      uploadedAt: photo.uploadedAt.toISOString(),
      uploadedBy: photo.uploadedBy.name,
      contentUrl: `/api/mobile/v1/photos/${photo.id}/content`,
    },
  });
}

/**
 * DELETE /api/mobile/v1/photos/:photoId — soft deletion only; the file and
 * row are preserved as evidence. Requires canUpdate on the site.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;

  const { photoId } = paramsSchema.parse(await params);
  const photo = await loadPhoto(photoId);
  if (!photo || photo.deletedAt) {
    return apiError(404, "NOT_FOUND", "Photo not found.");
  }
  const scope = await requireSiteScope(auth.user.id, photo.siteId, {
    write: true,
  });
  if (!scope.ok) return scope.res;

  await prisma.progressPhoto.update({
    where: { id: photo.id },
    data: { deletedAt: new Date() },
  });
  await logAuditEvent({
    userId: auth.user.id,
    action: "mobile-photo-delete",
    entity: "ProgressPhoto",
    entityId: photo.id,
    metadata: { siteId: photo.siteId, targetType: photo.targetType },
  });
  return apiOk({ deleted: true });
}

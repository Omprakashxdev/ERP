import { NextRequest } from "next/server";
import { ProgressPhotoTargetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiOk,
  requireMobileUser,
  requireSiteScope,
} from "@/lib/mobile/api";
import {
  contentHashOf,
  deletePhotoFile,
  MAX_PHOTO_BYTES,
  mimeFor,
  newStorageKey,
  readPhotoFile,
  resolvePhotoTarget,
  sniffImageType,
  stripImageMetadata,
  writePhotoFile,
} from "@/lib/progress-photos";
import { cleanedString, cuid } from "@/lib/schemas/shared";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";

function photoJson(p: {
  id: string;
  targetType: string;
  siteId: string;
  flatId: string | null;
  roomId: string | null;
  roomActivityId: string | null;
  mimeType: string;
  fileSize: number;
  caption: string | null;
  uploadedAt: Date;
  uploadedById: string;
}) {
  return {
    id: p.id,
    targetType: p.targetType,
    siteId: p.siteId,
    flatId: p.flatId,
    roomId: p.roomId,
    roomActivityId: p.roomActivityId,
    mimeType: p.mimeType,
    fileSize: p.fileSize,
    caption: p.caption,
    uploadedAt: p.uploadedAt.toISOString(),
    uploadedById: p.uploadedById,
    contentUrl: `/api/mobile/v1/photos/${p.id}/content`,
  };
}

/**
 * POST /api/mobile/v1/photos — multipart upload.
 * Fields: file (required), targetType (SITE|FLAT|ROOM|ACTIVITY),
 * targetId, caption?, clientEventId? (upload idempotency key).
 * Requires canUpdate on the resolved site; ancestors are resolved
 * server-side so hierarchy can never be spoofed.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return apiError(400, "BAD_FORM", "Expected multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return apiError(400, "NO_FILE", "A photo file is required.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return apiError(400, "TOO_LARGE", "Photo exceeds the 10MB limit.");
  }

  const targetParsed = z
    .object({
      targetType: z.nativeEnum(ProgressPhotoTargetType),
      targetId: cuid,
      caption: cleanedString(300).optional().nullable(),
      clientEventId: z.string().min(8).max(80).optional().nullable(),
    })
    .safeParse({
      targetType: form.get("targetType"),
      targetId: form.get("targetId"),
      caption: form.get("caption") ?? undefined,
      clientEventId: form.get("clientEventId") ?? undefined,
    });
  if (!targetParsed.success) {
    return apiError(400, "VALIDATION", "Invalid photo target fields.");
  }
  const { targetType, targetId, caption, clientEventId } = targetParsed.data;

  // Server resolves the whole chain — client ids are never trusted for
  // ancestry, only as the declared target.
  const target = await resolvePhotoTarget(targetType, targetId);
  if (!target) return apiError(404, "NOT_FOUND", "Photo target not found.");

  // Content validation — magic bytes decide the real type; a spoofed
  // filename/mime/svg/executable is rejected outright.
  const raw = Buffer.from(await file.arrayBuffer());
  const kind = sniffImageType(raw);
  if (!kind) {
    return apiError(
      400,
      "BAD_CONTENT",
      "Only JPEG, PNG and WebP images are accepted."
    );
  }
  const bytes = stripImageMetadata(raw, kind);
  const hash = contentHashOf(bytes);
  const safeName = (file.name || "photo").slice(0, 180);

  // Idempotent retry — the client re-sent a completed upload. The stored
  // event must belong to the same user, the same target AND the same
  // payload: reusing an eventId with different bytes or a different
  // caption is a conflict, never a silent success. A row whose file is
  // missing may only be repaired with byte-identical content.
  if (clientEventId) {
    const existing = await prisma.progressPhoto.findUnique({
      where: { clientEventId },
    });
    if (existing) {
      const sameTarget =
        existing.targetType === targetType &&
        existing.siteId === target.siteId &&
        existing.flatId === target.flatId &&
        existing.roomId === target.roomId &&
        existing.roomActivityId === target.roomActivityId;
      const samePayload =
        existing.contentHash === hash &&
        // An omitted caption asserts nothing; only an explicitly different
        // one conflicts with what was originally uploaded for this event.
        (caption == null || (existing.caption ?? null) === caption);
      if (
        existing.uploadedById !== user.id ||
        !sameTarget ||
        !samePayload ||
        existing.deletedAt
      ) {
        return apiError(409, "EVENT_CONFLICT", "clientEventId already used.");
      }
      const onDisk = await readPhotoFile(existing.storageKey);
      if (onDisk) {
        return apiOk({ photo: photoJson(existing), alreadyUploaded: true });
      }
      // File lost but the retry carries byte-identical content (hash
      // matched above) — restore it under the same storageKey.
      const scope = await requireSiteScope(user.id, target.siteId, {
        write: true,
      });
      if (!scope.ok) return scope.res;
      await writePhotoFile(existing.storageKey, bytes);
      return apiOk({ photo: photoJson(existing), alreadyUploaded: true });
    }
  }

  if (!target.chainActive) {
    return apiError(
      403,
      "INACTIVE",
      "Photos cannot be added to an inactive or archived structure."
    );
  }

  const scope = await requireSiteScope(user.id, target.siteId, {
    write: true,
  });
  if (!scope.ok) return scope.res;

  // Byte-identical re-upload to the same target — reuse the row and stamp
  // the client's event id onto it so idempotency bookkeeping stays intact.
  const dupe = await prisma.progressPhoto.findFirst({
    where: {
      contentHash: hash,
      siteId: target.siteId,
      flatId: target.flatId,
      roomId: target.roomId,
      roomActivityId: target.roomActivityId,
      deletedAt: null,
    },
  });
  if (dupe) {
    // Same content at the same target but the file is gone — restore the
    // bytes instead of claiming success for a record that cannot serve them.
    if (!(await readPhotoFile(dupe.storageKey))) {
      await writePhotoFile(dupe.storageKey, bytes);
    }
    if (clientEventId && !dupe.clientEventId) {
      await prisma.progressPhoto.update({
        where: { id: dupe.id },
        data: { clientEventId },
      });
    }
    return apiOk({ photo: photoJson(dupe), alreadyUploaded: true });
  }

  const storageKey = newStorageKey(kind);
  let stored = false;
  try {
    await writePhotoFile(storageKey, bytes);
    stored = true;
    const photo = await prisma.progressPhoto.create({
      data: {
        siteId: target.siteId,
        flatId: target.flatId,
        roomId: target.roomId,
        roomActivityId: target.roomActivityId,
        targetType,
        storageKey,
        originalFilename: safeName,
        mimeType: mimeFor(kind),
        fileSize: bytes.length,
        contentHash: hash,
        clientEventId: clientEventId ?? null,
        caption: caption ?? null,
        uploadedById: user.id,
      },
    });
    await logAuditEvent({
      userId: user.id,
      action: "mobile-photo-upload",
      entity: "ProgressPhoto",
      entityId: photo.id,
      metadata: {
        siteId: target.siteId,
        targetType,
        targetId,
        fileSize: bytes.length,
      },
    });
    return apiOk({ photo: photoJson(photo), alreadyUploaded: false }, 201);
  } catch (e) {
    // Never leave an unmanaged file behind when the DB write fails.
    if (stored) await deletePhotoFile(storageKey);
    // Concurrent upload with the same idempotency key — return the winner.
    if (
      clientEventId &&
      e instanceof Error &&
      e.message.includes("clientEventId")
    ) {
      const winner = await prisma.progressPhoto.findUnique({
        where: { clientEventId },
      });
      if (winner) {
        return apiOk({ photo: photoJson(winner), alreadyUploaded: true });
      }
    }
    throw e;
  }
}

/**
 * GET /api/mobile/v1/photos?targetType=&targetId= | ?siteId=
 * Lists non-deleted photos the user may view (canView on the site).
 */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  const url = new URL(req.url);
  const siteIdParam = url.searchParams.get("siteId");
  const targetTypeParam = url.searchParams.get("targetType");
  const targetIdParam = url.searchParams.get("targetId");

  let where;
  if (siteIdParam) {
    const siteId = cuid.safeParse(siteIdParam);
    if (!siteId.success) {
      return apiError(400, "VALIDATION", "Invalid siteId.");
    }
    const scope = await requireSiteScope(user.id, siteIdParam);
    if (!scope.ok) return scope.res;
    where = { siteId: siteIdParam, deletedAt: null };
  } else if (targetTypeParam && targetIdParam) {
    const parsed = z
      .object({
        targetType: z.nativeEnum(ProgressPhotoTargetType),
        targetId: cuid,
      })
      .safeParse({ targetType: targetTypeParam, targetId: targetIdParam });
    if (!parsed.success) {
      return apiError(400, "VALIDATION", "Invalid target filter.");
    }
    const target = await resolvePhotoTarget(
      parsed.data.targetType,
      parsed.data.targetId
    );
    if (!target) return apiError(404, "NOT_FOUND", "Target not found.");
    const scope = await requireSiteScope(user.id, target.siteId);
    if (!scope.ok) return scope.res;
    where = {
      siteId: target.siteId,
      flatId: target.flatId,
      roomId: target.roomId,
      roomActivityId: target.roomActivityId,
      targetType: parsed.data.targetType,
      deletedAt: null,
    };
  } else {
    return apiError(
      400,
      "VALIDATION",
      "Provide either siteId or targetType+targetId."
    );
  }

  const photos = await prisma.progressPhoto.findMany({
    where,
    orderBy: { uploadedAt: "desc" },
    take: 200,
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  return apiOk({
    items: photos.map((p) => ({
      ...photoJson(p),
      uploadedBy: p.uploadedBy.name,
    })),
  });
}

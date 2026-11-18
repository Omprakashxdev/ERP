"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ProgressSiteStatus, Prisma } from "@prisma/client";
import {
  progressSiteCreateSchema,
  progressSiteUpdateSchema,
  progressSiteFilterSchema,
  ProgressSiteCreateInput,
  ProgressSiteUpdateInput,
  ProgressSiteFilterInput,
} from "@/lib/schemas/progress-site";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";
import {
  MAX_COVER_BYTES,
  sniffImageType,
  stripImageMetadata,
  newStorageKey,
  writePhotoFile,
  deletePhotoFile,
} from "@/lib/progress-photos";

const RESOURCE = "progressApp";
const PROGRESS_APP_PATH = "/dashboard/progress-app";

export async function createProgressSite(
  input: ProgressSiteCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "create", async (user) => {
    const parsed = progressSiteCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const duplicate = await prisma.progressSite.findUnique({
      where: { siteCode: parsed.siteCode },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error(`Site code ${parsed.siteCode} is already in use.`);
    }

    const site = await prisma.progressSite.create({
      data: { ...parsed, createdById: user.id },
      select: { id: true },
    });

    await audit(user.id, "create", "ProgressSite", site.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath(PROGRESS_APP_PATH);
    return site;
  });
}

export async function updateProgressSite(
  input: ProgressSiteUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = progressSiteUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.progressSite.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("Site not found.");
    }

    const site = await prisma.progressSite.update({
      where: { id },
      data,
      select: { id: true },
    });

    await audit(user.id, "update", "ProgressSite", site.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath(PROGRESS_APP_PATH);
    revalidatePath(`${PROGRESS_APP_PATH}/sites/${id}`);
    return site;
  });
}

export async function setProgressSiteStatus(
  id: string,
  status: ProgressSiteStatus
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = progressSiteUpdateSchema.shape.id.parse(id);
    const parsedStatus = progressSiteUpdateSchema.shape.status.parse(status);
    if (!parsedStatus) {
      throw new Error("A valid status is required.");
    }
    await checkRateLimit(user.id);

    const existing = await prisma.progressSite.findUnique({
      where: { id: parsedId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new Error("Site not found.");
    }
    if (existing.status === parsedStatus) {
      return { id: parsedId };
    }

    const site = await prisma.progressSite.update({
      where: { id: parsedId },
      data: { status: parsedStatus },
      select: { id: true },
    });

    await audit(user.id, "status-change", "ProgressSite", site.id, {
      from: existing.status,
      to: parsedStatus,
    });

    revalidatePath(PROGRESS_APP_PATH);
    revalidatePath(`${PROGRESS_APP_PATH}/sites/${parsedId}`);
    return site;
  });
}

/**
 * Upload/replace a site's cover image. Admin-scoped (progressApp update —
 * only ADMIN holds it), ≤5MB JPEG/PNG/WebP, magic-byte sniffed and
 * metadata-stripped before reaching persistent private storage. The old
 * cover file is deleted after the new one is safely on disk.
 */
export async function uploadSiteCover(
  siteId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = progressSiteUpdateSchema.shape.id.parse(siteId);
    await checkRateLimit(user.id);

    const site = await prisma.progressSite.findUnique({
      where: { id: parsedId },
      select: { id: true, coverImagePath: true },
    });
    if (!site) throw new Error("Site not found.");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Choose a JPEG, PNG or WebP image to upload.");
    }
    if (file.size > MAX_COVER_BYTES) {
      throw new Error("Cover image must be 5 MB or smaller.");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) {
      throw new Error("Only JPEG, PNG or WebP images are accepted.");
    }

    const storageKey = newStorageKey(type);
    const stored = stripImageMetadata(bytes, type);
    await writePhotoFile(storageKey, stored);

    await prisma.progressSite.update({
      where: { id: parsedId },
      data: { coverImagePath: storageKey },
      select: { id: true },
    });
    if (site.coverImagePath) {
      await deletePhotoFile(site.coverImagePath);
    }

    await audit(user.id, "cover-upload", "ProgressSite", parsedId, {
      bytes: stored.length,
      type,
    });

    revalidatePath(PROGRESS_APP_PATH);
    revalidatePath(`${PROGRESS_APP_PATH}/sites/${parsedId}`);
    return { id: parsedId };
  });
}

/** Remove a site's cover image and delete its stored file. */
export async function removeSiteCover(
  siteId: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = progressSiteUpdateSchema.shape.id.parse(siteId);
    await checkRateLimit(user.id);

    const site = await prisma.progressSite.findUnique({
      where: { id: parsedId },
      select: { id: true, coverImagePath: true },
    });
    if (!site) throw new Error("Site not found.");

    await prisma.progressSite.update({
      where: { id: parsedId },
      data: { coverImagePath: null },
      select: { id: true },
    });
    if (site.coverImagePath) {
      await deletePhotoFile(site.coverImagePath);
    }

    await audit(user.id, "cover-remove", "ProgressSite", parsedId, {});

    revalidatePath(PROGRESS_APP_PATH);
    revalidatePath(`${PROGRESS_APP_PATH}/sites/${parsedId}`);
    return { id: parsedId };
  });
}

export async function getProgressSites(
  filter?: ProgressSiteFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission(RESOURCE, "read", async () => {
    const parsed = filter ? progressSiteFilterSchema.parse(filter) : undefined;

    const where: Prisma.ProgressSiteWhereInput = {};
    if (parsed?.search?.trim()) {
      const q = parsed.search.trim();
      where.OR = [
        { siteName: { contains: q, mode: "insensitive" } },
        { siteCode: { contains: q, mode: "insensitive" } },
      ];
    }
    if (parsed?.status) {
      where.status = parsed.status;
    } else if (!parsed?.includeArchived) {
      where.status = { not: ProgressSiteStatus.ARCHIVED };
    }

    const [rows, total] = await Promise.all([
      prisma.progressSite.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ siteCode: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.progressSite.count({ where }),
    ]);

    return { rows, total };
  });
}

export async function getProgressSiteById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission(RESOURCE, "read", async () => {
    const site = await prisma.progressSite.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, abbreviation: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    return site;
  });
}

export interface SiteSetupCounts {
  wings: number;
  floors: number;
  flats: number;
  rooms: number;
  checklists: number;
  assignments: number;
  firstWingId: string | null;
  firstFloorId: string | null;
  firstFlatId: string | null;
  firstRoomId: string | null;
}

/**
 * Hierarchy + configuration counts for the site-setup workflow card,
 * with first-child ids so each level can deep-link to its own
 * management page.
 */
export async function getSiteSetupCounts(
  siteId: string
): Promise<ActionResult<SiteSetupCounts>> {
  return withPermission(RESOURCE, "read", async () => {
    const parsedId = progressSiteUpdateSchema.shape.id.parse(siteId);
    const [wings, floors, flats, rooms, checklists, assignments] =
      await Promise.all([
        prisma.progressWing.count({ where: { siteId: parsedId } }),
        prisma.progressFloor.count({ where: { wing: { siteId: parsedId } } }),
        prisma.progressFlat.count({
          where: { floor: { wing: { siteId: parsedId } } },
        }),
        prisma.progressRoom.count({
          where: { flat: { floor: { wing: { siteId: parsedId } } } },
        }),
        prisma.progressRoomChecklist.count({
          where: {
            isActive: true,
            room: { flat: { floor: { wing: { siteId: parsedId } } } },
          },
        }),
        prisma.progressSiteAssignment.count({
          where: { siteId: parsedId, isActive: true },
        }),
      ]);
    const [firstWing, firstFloor, firstFlat, firstRoom] = await Promise.all([
      prisma.progressWing.findFirst({
        where: { siteId: parsedId },
        orderBy: { displayOrder: "asc" },
        select: { id: true },
      }),
      prisma.progressFloor.findFirst({
        where: { wing: { siteId: parsedId } },
        orderBy: { displayOrder: "asc" },
        select: { id: true },
      }),
      prisma.progressFlat.findFirst({
        where: { floor: { wing: { siteId: parsedId } } },
        orderBy: { displayOrder: "asc" },
        select: { id: true },
      }),
      prisma.progressRoom.findFirst({
        where: { flat: { floor: { wing: { siteId: parsedId } } } },
        orderBy: { displayOrder: "asc" },
        select: { id: true },
      }),
    ]);
    return {
      wings,
      floors,
      flats,
      rooms,
      checklists,
      assignments,
      firstWingId: firstWing?.id ?? null,
      firstFloorId: firstFloor?.id ?? null,
      firstFlatId: firstFlat?.id ?? null,
      firstRoomId: firstRoom?.id ?? null,
    };
  });
}

export async function getProgressAppProjects(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  return withPermission(RESOURCE, "read", async () => {
    const projects = await prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return projects;
  });
}

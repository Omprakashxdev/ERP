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

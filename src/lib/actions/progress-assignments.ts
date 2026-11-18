"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  siteAssignmentGrantSchema,
  siteAssignmentScopeSchema,
  SiteAssignmentGrantInput,
  SiteAssignmentScopeInput,
} from "@/lib/schemas/progress-assignment";
import { cuid } from "@/lib/schemas/shared";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

const RESOURCE = "progressApp";

const assignmentInclude = {
  user: {
    select: { id: true, name: true, email: true, role: true, isActive: true },
  },
  assignedBy: { select: { name: true, email: true } },
  deactivatedBy: { select: { name: true, email: true } },
  site: { select: { id: true, siteCode: true, siteName: true } },
} as const;

/**
 * Grant or refresh a mobile site assignment. Re-granting a revoked
 * assignment reactivates it and records a REACTIVATED event, so every
 * grant/revoke cycle stays in the audit trail.
 */
export async function assignSiteStaff(
  input: SiteAssignmentGrantInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "create", async (user) => {
    const parsed = siteAssignmentGrantSchema.parse(input);
    await checkRateLimit(user.id);

    const assignment = await prisma.$transaction(async (tx) => {
      const site = await tx.progressSite.findUnique({
        where: { id: parsed.siteId },
        select: { id: true },
      });
      if (!site) throw new Error("Site not found.");

      // Identity is resolved by primary key only — never by name match.
      const target = await tx.user.findUnique({
        where: { id: parsed.userId },
        select: { id: true, isActive: true },
      });
      if (!target) throw new Error("User not found.");
      if (!target.isActive) {
        throw new Error("Cannot assign a deactivated user.");
      }

      const existing = await tx.progressSiteAssignment.findUnique({
        where: {
          siteId_userId: { siteId: parsed.siteId, userId: parsed.userId },
        },
      });

      if (existing) {
        const revived = await tx.progressSiteAssignment.update({
          where: { id: existing.id },
          data: {
            canView: parsed.canView,
            canUpdate: parsed.canUpdate,
            isActive: true,
            assignedById: user.id,
            assignedAt: new Date(),
            deactivatedAt: null,
            deactivatedById: null,
          },
          select: { id: true },
        });
        await tx.progressSiteAssignmentEvent.create({
          data: {
            assignmentId: existing.id,
            type: existing.isActive ? "SCOPE_UPDATED" : "REACTIVATED",
            canView: parsed.canView,
            canUpdate: parsed.canUpdate,
            changedById: user.id,
          },
        });
        return revived;
      }

      const created = await tx.progressSiteAssignment.create({
        data: {
          siteId: parsed.siteId,
          userId: parsed.userId,
          canView: parsed.canView,
          canUpdate: parsed.canUpdate,
          assignedById: user.id,
        },
        select: { id: true },
      });
      await tx.progressSiteAssignmentEvent.create({
        data: {
          assignmentId: created.id,
          type: "GRANTED",
          canView: parsed.canView,
          canUpdate: parsed.canUpdate,
          changedById: user.id,
        },
      });
      return created;
    });

    await audit(user.id, "assign-staff", "ProgressSiteAssignment", assignment.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`/dashboard/progress-app/sites/${parsed.siteId}`);
    return assignment;
  });
}

export async function updateSiteAssignmentScope(
  input: SiteAssignmentScopeInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = siteAssignmentScopeSchema.parse(input);
    await checkRateLimit(user.id);

    const assignment = await prisma.$transaction(async (tx) => {
      const existing = await tx.progressSiteAssignment.findUnique({
        where: { id: parsed.assignmentId },
        select: { id: true, isActive: true },
      });
      if (!existing) throw new Error("Assignment not found.");

      const updated = await tx.progressSiteAssignment.update({
        where: { id: existing.id },
        data: { canView: parsed.canView, canUpdate: parsed.canUpdate },
        select: { id: true },
      });
      await tx.progressSiteAssignmentEvent.create({
        data: {
          assignmentId: existing.id,
          type: "SCOPE_UPDATED",
          canView: parsed.canView,
          canUpdate: parsed.canUpdate,
          changedById: user.id,
        },
      });
      return updated;
    });

    await audit(
      user.id,
      "update-assignment-scope",
      "ProgressSiteAssignment",
      assignment.id,
      { input: await sanitizeForAudit(parsed as Record<string, unknown>) }
    );
    return assignment;
  });
}

export async function setSiteAssignmentActive(
  assignmentId: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = cuid.parse(assignmentId);
    if (typeof isActive !== "boolean") {
      throw new Error("isActive must be a boolean.");
    }
    await checkRateLimit(user.id);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.progressSiteAssignment.findUnique({
        where: { id: parsedId },
        select: { id: true, isActive: true, canView: true, canUpdate: true },
      });
      if (!existing) throw new Error("Assignment not found.");
      if (existing.isActive === isActive) return { id: parsedId };

      await tx.progressSiteAssignment.update({
        where: { id: parsedId },
        data: isActive
          ? { isActive: true, deactivatedAt: null, deactivatedById: null }
          : {
              isActive: false,
              deactivatedAt: new Date(),
              deactivatedById: user.id,
            },
      });
      await tx.progressSiteAssignmentEvent.create({
        data: {
          assignmentId: parsedId,
          type: isActive ? "REACTIVATED" : "REVOKED",
          canView: existing.canView,
          canUpdate: existing.canUpdate,
          changedById: user.id,
        },
      });
      return { id: parsedId };
    });

    await audit(
      user.id,
      isActive ? "reactivate-assignment" : "revoke-assignment",
      "ProgressSiteAssignment",
      parsedId
    );
    return result;
  });
}

export async function getSiteAssignments(
  siteId: string
): Promise<ActionResult<unknown[]>> {
  return withPermission(RESOURCE, "read", async () => {
    const parsedId = cuid.parse(siteId);
    return prisma.progressSiteAssignment.findMany({
      where: { siteId: parsedId },
      include: assignmentInclude,
      orderBy: [{ isActive: "desc" }, { assignedAt: "desc" }],
    });
  });
}

export async function getSiteAssignmentHistory(
  siteId: string
): Promise<ActionResult<unknown[]>> {
  return withPermission(RESOURCE, "read", async () => {
    const parsedId = cuid.parse(siteId);
    return prisma.progressSiteAssignmentEvent.findMany({
      where: { assignment: { siteId: parsedId } },
      include: {
        changedBy: { select: { name: true, email: true } },
        assignment: {
          select: { user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
}

/** Active ERP users selectable for assignment (admin dialog only). */
export async function getAssignableUsers(): Promise<ActionResult<unknown[]>> {
  return withPermission(RESOURCE, "create", async () => {
    return prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 500,
    });
  });
}

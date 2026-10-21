"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { Role } from "@/types/auth";
import {
  projectCreateSchema,
  projectUpdateSchema,
  projectFilterSchema,
  ProjectCreateInput,
  ProjectUpdateInput,
  ProjectFilterInput,
} from "@/lib/schemas/project";
import { addExcelMonths } from "@/lib/date-utils";
import { computeTotalFee } from "@/lib/fund-flow-calcs";
import { withAuth, checkRateLimit, audit, sanitizeForAudit, ActionResult } from "./wrapper";

const mutationRoles = [Role.ADMIN, Role.MANAGER];

function computeProjectDates(input: ProjectCreateInput) {
  const workOrderDate = input.workOrderDate;
  const timeLimitMonths = input.timeLimitMonths;
  // "Grace period" is a manual field — no invented default.
  const additionalTimeMonths =
    input.additionalTimeMonths ?? new Decimal(0);
  const targetTimeLimitMonths =
    input.targetTimeLimitMonths ??
    new Decimal(
      (timeLimitMonths.toNumber() + additionalTimeMonths.toNumber()).toFixed(4)
    );

  // Customer-confirmed Excel method: WO + (months × 30.416 days).
  const stipulatedCompletionDate =
    input.stipulatedCompletionDate ?? addExcelMonths(workOrderDate, timeLimitMonths);
  const targetCompletionDate =
    input.targetCompletionDate ??
    addExcelMonths(workOrderDate, targetTimeLimitMonths);

  return {
    additionalTimeMonths,
    targetTimeLimitMonths,
    stipulatedCompletionDate,
    targetCompletionDate,
  };
}

export async function createProject(
  input: ProjectCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = projectCreateSchema.parse(input);
    const computed = computeProjectDates(parsed);
    await checkRateLimit(user.id);

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          regionId: parsed.regionId,
          clientId: parsed.clientId,
          name: parsed.name,
          abbreviation: parsed.abbreviation,
          address: parsed.address,
          agreementDate: parsed.agreementDate,
          workOrderDate: parsed.workOrderDate,
          timeLimitMonths: parsed.timeLimitMonths,
          additionalTimeMonths: computed.additionalTimeMonths,
          targetTimeLimitMonths: computed.targetTimeLimitMonths,
          stipulatedCompletionDate: computed.stipulatedCompletionDate,
          targetCompletionDate: computed.targetCompletionDate,
          estimatedCost: parsed.estimatedCost,
          totalFee: parsed.totalFee,
          status: parsed.status,
          workType: parsed.workType,
          serviceType: parsed.serviceType,
          contractorId: parsed.contractorId,
          assignments: parsed.assignments
            ? {
                create: parsed.assignments.map((a) => ({
                  staffId: a.staffId,
                  role: a.role,
                  allocation: a.allocation,
                })),
              }
            : undefined,
          feeStages: parsed.feeStages
            ? {
                create: parsed.feeStages.map((s) => ({
                  stageName: s.stageName,
                  percentage: s.percentage,
                  amount: s.amount,
                  dueDate: s.dueDate,
                })),
              }
            : undefined,
        },
      });

      await tx.fundFlow.upsert({
        where: { projectId: created.id },
        create: {
          projectId: created.id,
          totalProjectCost: parsed.estimatedCost,
        },
        update: {},
      });

      return created;
    });

    await audit(user.id, "create", "Project", project.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    return { id: project.id };
  }, mutationRoles);
}

export async function updateProject(
  input: ProjectUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = projectUpdateSchema.parse(input);
    const { id, assignments, feeStages } = parsed;
    // projectUpdateSchema derives via .partial(), but Zod keeps .default()
    // values (estimatedCost/totalFee → 0.00, status → ACTIVE) — absent keys
    // would be spread into the update and clobber stored values. Keep only
    // keys the caller actually sent.
    const data: Partial<Omit<typeof parsed, "id" | "assignments" | "feeStages">> =
      {};
    for (const k of Object.keys(input as Record<string, unknown>)) {
      const key = k as keyof typeof data;
      if (
        (key as string) !== "id" &&
        (key as string) !== "assignments" &&
        (key as string) !== "feeStages" &&
        parsed[key as keyof typeof parsed] !== undefined
      ) {
        (data as Record<string, unknown>)[key] =
          parsed[key as keyof typeof parsed];
      }
    }
    await checkRateLimit(user.id);

    const project = await prisma.$transaction(async (tx) => {
      const existing = await tx.project.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Project not found");
      }

      const workOrderDate = data.workOrderDate ?? existing.workOrderDate;
      const timeLimitMonths =
        data.timeLimitMonths ?? existing.timeLimitMonths;
      const additionalTimeMonths =
        data.additionalTimeMonths !== undefined
          ? data.additionalTimeMonths
          : existing.additionalTimeMonths;
      // Recompute only when a date-driving value actually CHANGED — the
      // form submits all fields, so "was supplied" is meaningless; compare
      // against stored values. An unchanged or unrelated save must not
      // convert NULL legacy dates into computed ones. No invented grace:
      // NULL Grace period counts as 0, never TL×0.5.
      const decEq = (
        a: Decimal | null | undefined,
        b: Decimal | null | undefined
      ) =>
        a == null
          ? b == null
          : b != null && new Decimal(a.toString()).equals(b.toString());
      const datesTouched =
        (data.workOrderDate !== undefined &&
          data.workOrderDate.getTime() !== existing.workOrderDate.getTime()) ||
        (data.timeLimitMonths !== undefined &&
          !decEq(data.timeLimitMonths, existing.timeLimitMonths)) ||
        (data.additionalTimeMonths !== undefined &&
          !decEq(data.additionalTimeMonths, existing.additionalTimeMonths));
      const targetTimeLimitMonths =
        data.targetTimeLimitMonths != null
          ? data.targetTimeLimitMonths
          : datesTouched
            ? new Decimal(
                (
                  timeLimitMonths.toNumber() +
                  (additionalTimeMonths?.toNumber() ?? 0)
                ).toFixed(4)
              )
            : existing.targetTimeLimitMonths;

      const stipulatedCompletionDate =
        data.stipulatedCompletionDate != null
          ? data.stipulatedCompletionDate
          : datesTouched
            ? addExcelMonths(workOrderDate, timeLimitMonths)
            : existing.stipulatedCompletionDate;
      const targetCompletionDate =
        data.targetCompletionDate != null
          ? data.targetCompletionDate
          : datesTouched
            ? addExcelMonths(
                workOrderDate,
                targetTimeLimitMonths ?? timeLimitMonths
              )
            : existing.targetCompletionDate;

      const updated = await tx.project.update({
        where: { id },
        data: {
          ...data,
          additionalTimeMonths,
          targetTimeLimitMonths,
          stipulatedCompletionDate,
          targetCompletionDate,
        },
      });

      if (assignments) {
        await tx.projectAssignment.deleteMany({ where: { projectId: id } });
        await tx.projectAssignment.createMany({
          data: assignments.map((a) => ({
            projectId: id,
            staffId: a.staffId,
            role: a.role,
            allocation: a.allocation,
          })),
        });
      }

      if (feeStages) {
        await tx.projectFeeStage.deleteMany({ where: { projectId: id } });
        await tx.projectFeeStage.createMany({
          data: feeStages.map((s) => ({
            projectId: id,
            stageName: s.stageName,
            percentage: s.percentage,
            amount: s.amount,
            dueDate: s.dueDate,
          })),
        });
      }

      if (data.estimatedCost !== undefined) {
        await tx.fundFlow.updateMany({
          where: { projectId: id },
          data: { totalProjectCost: data.estimatedCost },
        });
        // Keep Total Fee consistent — Total Project Cost × stored Fee
        // percentage / 100. Records without a percentage keep their fee.
        const ff = await tx.fundFlow.findUnique({
          where: { projectId: id },
          select: { feePercentage: true },
        });
        if (ff?.feePercentage != null) {
          await tx.project.update({
            where: { id },
            data: {
              totalFee: computeTotalFee(data.estimatedCost, ff.feePercentage),
            },
          });
        }
      }

      return updated;
    });

    await audit(user.id, "update", "Project", project.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    return { id: project.id };
  }, mutationRoles);
}

export async function getProjects(
  filter?: ProjectFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withAuth(async () => {
    const parsed = filter ? projectFilterSchema.parse(filter) : undefined;
    const where: Record<string, unknown> = {};

    if (parsed?.regionId) where.regionId = parsed.regionId;
    if (parsed?.clientId) where.clientId = parsed.clientId;
    if (parsed?.status) where.status = parsed.status;
    if (parsed?.workType) where.workType = parsed.workType;
    if (parsed?.serviceType) where.serviceType = parsed.serviceType;
    if (parsed?.workOrderDateFrom || parsed?.workOrderDateTo) {
      where.workOrderDate = {};
      if (parsed.workOrderDateFrom)
        (where.workOrderDate as Record<string, Date>).gte = parsed.workOrderDateFrom;
      if (parsed.workOrderDateTo)
        (where.workOrderDate as Record<string, Date>).lte = parsed.workOrderDateTo;
    }
    if (parsed?.search) {
      where.name = { contains: parsed.search, mode: "insensitive" };
    }

    const [rows, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          region: true,
          client: true,
          contractor: true,
          assignments: { include: { staff: true } },
          feeStages: true,
          fundFlow: true,
        },
        orderBy: { workOrderDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.project.count({ where }),
    ]);

    return { rows, total };
  });
}

export async function getProjectById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withAuth(async () => {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        region: true,
        client: true,
        contractor: true,
        assignments: { include: { staff: true } },
        feeStages: true,
        fundFlow: true,
      },
    });
    return project;
  });
}

export async function getProjectsForContractor(
  contractorId: string
): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    const projects = await prisma.project.findMany({
      where: { contractorId },
      select: {
        id: true,
        name: true,
        workOrderDate: true,
        status: true,
        workType: true,
        serviceType: true,
      },
      orderBy: { workOrderDate: "desc" },
    });
    return projects;
  });
}

export async function getUnlinkedProjects(
  contractorId: string
): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    const projects = await prisma.project.findMany({
      where: {
        contractorId: null,
        status: { not: "COMPLETED" },
      },
      select: {
        id: true,
        name: true,
        workOrderDate: true,
        status: true,
        workType: true,
        serviceType: true,
      },
      orderBy: { name: "asc" },
    });
    return projects;
  });
}

export async function linkProjectToContractor(
  projectId: string,
  contractorId: string
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    await checkRateLimit(user.id);
    const project = await prisma.project.update({
      where: { id: projectId },
      data: { contractorId },
    });
    await audit(user.id, "update", "Project", project.id, {
      action: "linkToContractor",
      contractorId,
    });
    revalidatePath("/dashboard/contractors");
    revalidatePath("/dashboard/projects");
    return { id: project.id };
  });
}

export async function unlinkProjectFromContractor(
  projectId: string
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    await checkRateLimit(user.id);
    const project = await prisma.project.update({
      where: { id: projectId },
      data: { contractorId: null },
    });
    await audit(user.id, "update", "Project", project.id, {
      action: "unlinkFromContractor",
    });
    revalidatePath("/dashboard/contractors");
    revalidatePath("/dashboard/projects");
    return { id: project.id };
  });
}

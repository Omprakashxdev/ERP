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
import { addMonths } from "@/lib/date-utils";
import { withAuth, checkRateLimit, audit, sanitizeForAudit, ActionResult } from "./wrapper";

const mutationRoles = [Role.ADMIN, Role.MANAGER];

function computeProjectDates(input: ProjectCreateInput) {
  const workOrderDate = input.workOrderDate;
  const timeLimitMonths = input.timeLimitMonths;
  const additionalTimeMonths =
    input.additionalTimeMonths ??
    new Decimal((timeLimitMonths.toNumber() * 0.5).toFixed(4));
  const targetTimeLimitMonths =
    input.targetTimeLimitMonths ??
    new Decimal(
      (timeLimitMonths.toNumber() + additionalTimeMonths.toNumber()).toFixed(4)
    );

  const stipulatedCompletionDate =
    input.stipulatedCompletionDate ?? addMonths(workOrderDate, timeLimitMonths);
  const targetCompletionDate =
    input.targetCompletionDate ??
    addMonths(workOrderDate, targetTimeLimitMonths);

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
    const { id, assignments, feeStages, ...data } = parsed;
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
        data.additionalTimeMonths ?? existing.additionalTimeMonths;
      const targetTimeLimitMonths =
        data.targetTimeLimitMonths ??
        new Decimal(
          (
            timeLimitMonths.toNumber() +
            (additionalTimeMonths?.toNumber() ?? timeLimitMonths.toNumber() * 0.5)
          ).toFixed(4)
        );

      const stipulatedCompletionDate =
        data.stipulatedCompletionDate ??
        (data.workOrderDate || data.timeLimitMonths
          ? addMonths(workOrderDate, timeLimitMonths)
          : existing.stipulatedCompletionDate);
      const targetCompletionDate =
        data.targetCompletionDate ??
        (data.workOrderDate || data.timeLimitMonths || data.additionalTimeMonths
          ? addMonths(workOrderDate, targetTimeLimitMonths)
          : existing.targetCompletionDate);

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

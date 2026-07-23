"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  fundFlowUpdateSchema,
  fundFlowFilterSchema,
  FundFlowUpdateInput,
  FundFlowFilterInput,
} from "@/lib/schemas/fund-flow";
import { buildFundFlowWhere } from "@/lib/queries/fund-flow";
import { withPermission, checkRateLimit, audit, sanitizeForAudit, ActionResult } from "./wrapper";

export async function upsertFundFlow(
  input: FundFlowUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("fundFlow", "update", async (user) => {
    const parsed = fundFlowUpdateSchema.parse(input);
    const { projectId, ...data } = parsed;
    await checkRateLimit(user.id);

    const fundFlow = await prisma.fundFlow.upsert({
      where: { projectId },
      create: {
        projectId,
        miscExp: data.miscExp ?? new Decimal("0.00"),
        staffExp: data.staffExp ?? new Decimal("0.00"),
        totalProjectCost: data.totalProjectCost ?? new Decimal("0.00"),
        completedWorkAmt: data.completedWorkAmt ?? new Decimal("0.00"),
        proposedDueBillAmount: data.proposedDueBillAmount ?? new Decimal("0.00"),
        feeReceived: data.feeReceived ?? new Decimal("0.00"),
      },
      update: data,
    });

    await audit(user.id, "upsert", "FundFlow", fundFlow.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    return { id: fundFlow.id };
  });
}

export async function getFundFlows(
  filter?: FundFlowFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("fundFlow", "read", async () => {
    const parsed = filter ? fundFlowFilterSchema.parse(filter) : undefined;
    const where = buildFundFlowWhere(parsed);

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

    const computedRows = rows.map((project) => {
      const fundFlow = project.fundFlow;
      const remainingWorkAmt = fundFlow
        ? new Decimal(fundFlow.totalProjectCost.toString()).minus(
            fundFlow.completedWorkAmt.toString()
          )
        : new Decimal("0.00");
      const remainingFee = fundFlow
        ? new Decimal(project.totalFee.toString()).minus(
            fundFlow.feeReceived.toString()
          )
        : new Decimal("0.00");

      return {
        ...project,
        remainingWorkAmt,
        remainingFee,
      };
    });

    return { rows: computedRows, total };
  });
}

export async function getFundFlowByProjectId(
  projectId: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("fundFlow", "read", async () => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        region: true,
        client: true,
        contractor: true,
        assignments: { include: { staff: true } },
        feeStages: true,
        fundFlow: true,
      },
    });

    if (!project) return null;

    const fundFlow = project.fundFlow;
    const remainingWorkAmt = fundFlow
      ? new Decimal(fundFlow.totalProjectCost.toString()).minus(
          fundFlow.completedWorkAmt.toString()
        )
      : new Decimal("0.00");
    const remainingFee = fundFlow
      ? new Decimal(project.totalFee.toString()).minus(
          fundFlow.feeReceived.toString()
        )
      : new Decimal("0.00");

    return { ...project, remainingWorkAmt, remainingFee };
  });
}

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
import {
  reconcileProject,
  ReconciliationSourceRecords,
} from "@/lib/fund-flow/reconciliation";
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
        remainingFeeBasis: "LEGACY_FEE_RECEIVED" as const,
        reconciliationAvailable: false,
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
        dueBills: true,
        wip: true,
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

    // Reuse FF-01A reconciliation for authoritative invoice/settlement/cheque totals
    const sources: ReconciliationSourceRecords = {
      project: {
        id: project.id,
        estimatedCost: project.estimatedCost,
        totalFee: project.totalFee,
      },
      fundFlow: fundFlow
        ? {
            id: fundFlow.id,
            miscExp: fundFlow.miscExp,
            staffExp: fundFlow.staffExp,
            totalProjectCost: fundFlow.totalProjectCost,
            completedWorkAmt: fundFlow.completedWorkAmt,
            proposedDueBillAmount: fundFlow.proposedDueBillAmount,
            feeReceived: fundFlow.feeReceived,
          }
        : null,
      dueBills: project.dueBills.map((bill) => ({
        id: bill.id,
        grossAmount: bill.grossAmount,
        sgst: bill.sgst,
        cgst: bill.cgst,
        billAmount: bill.billAmount,
        chequeAmount: bill.chequeAmount,
        sd: bill.sd,
        itTds: bill.itTds,
        receivedAmount: bill.receivedAmount,
        billDate: bill.billDate,
        receiveDate: bill.receiveDate,
        status: bill.status,
      })),
      wip: project.wip
        ? {
            id: project.wip.id,
            amountOfWorkDone: project.wip.amountOfWorkDone,
            finalProgressAmount: project.wip.finalProgressAmount,
            raBill1Amount: project.wip.raBill1Amount,
            raBill2Amount: project.wip.raBill2Amount,
            raBill3Amount: project.wip.raBill3Amount,
            raBill4Amount: project.wip.raBill4Amount,
            raBill1SaecFee: project.wip.raBill1SaecFee,
            raBill2SaecFee: project.wip.raBill2SaecFee,
            raBill3SaecFee: project.wip.raBill3SaecFee,
            raBill4SaecFee: project.wip.raBill4SaecFee,
            raBill1ProjectExpense: project.wip.raBill1ProjectExpense,
            raBill2ProjectExpense: project.wip.raBill2ProjectExpense,
            raBill3ProjectExpense: project.wip.raBill3ProjectExpense,
            raBill4ProjectExpense: project.wip.raBill4ProjectExpense,
          }
        : null,
      feeStages: project.feeStages.map((stage) => ({
        id: stage.id,
        amount: stage.amount,
        percentage: stage.percentage,
      })),
    };

    const reconciliation = reconcileProject(sources);

    return {
      ...project,
      remainingWorkAmt,
      remainingFee,
      remainingFeeBasis: "LEGACY_FEE_RECEIVED" as const,
      reconciliationAvailable: true,
      totalContractFee: project.totalFee,
      totalInvoiced: reconciliation.invoiceSettlementTotals.invoiceTotal,
      totalSettlement: reconciliation.invoiceSettlementTotals.settlementTotal,
      totalRecordedCheque: reconciliation.invoiceSettlementTotals.chequeTotal,
      outstandingPerSettlement: reconciliation.invoiceSettlementTotals.outstandingTotal,
      legacyFeeReceived: fundFlow?.feeReceived ?? null,
      recordedCashLabel: reconciliation.recordedCash.explanation,
      wipRaBillProjectExpense: reconciliation.wipComparison.totalProjectExpense,
    };
  });
}

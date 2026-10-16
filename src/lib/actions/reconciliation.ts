"use server";

import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  reconcileProject,
  ReconciliationResult,
  ReconciliationSourceRecords,
} from "@/lib/fund-flow/reconciliation";
import {
  computeMonthlyBreakdown,
  MonthlyBreakdownResult,
  MonthlyBreakdownSources,
} from "@/lib/fund-flow/monthly";
import { withPermission, ActionResult } from "./wrapper";

const projectIdSchema = z.string().cuid("Invalid project ID");

export async function getProjectReconciliation(
  projectId: string
): Promise<ActionResult<ReconciliationResult>> {
  return withPermission("fundFlow", "read", async () => {
    const parsedId = projectIdSchema.parse(projectId);

    const project = await prisma.project.findUnique({
      where: { id: parsedId },
      include: {
        fundFlow: true,
        dueBills: true,
        wip: true,
        feeStages: true,
      },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const sources: ReconciliationSourceRecords = {
      project: {
        id: project.id,
        estimatedCost: project.estimatedCost,
        totalFee: project.totalFee,
      },
      fundFlow: project.fundFlow
        ? {
            id: project.fundFlow.id,
            miscExp: project.fundFlow.miscExp,
            staffExp: project.fundFlow.staffExp,
            totalProjectCost: project.fundFlow.totalProjectCost,
            completedWorkAmt: project.fundFlow.completedWorkAmt,
            proposedDueBillAmount: project.fundFlow.proposedDueBillAmount,
            feeReceived: project.fundFlow.feeReceived,
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

    const result = reconcileProject(sources);
    return result;
  });
}

export async function getProjectMonthlyBreakdown(
  projectId: string
): Promise<ActionResult<MonthlyBreakdownResult>> {
  return withPermission("fundFlow", "read", async () => {
    const parsedId = projectIdSchema.parse(projectId);

    const project = await prisma.project.findUnique({
      where: { id: parsedId },
      include: {
        fundFlow: { include: { monthlyData: true } },
        dueBills: true,
      },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const sources: MonthlyBreakdownSources = {
      project: {
        id: project.id,
        workOrderDate: project.workOrderDate,
      },
      fundFlow: project.fundFlow
        ? {
            id: project.fundFlow.id,
            monthlyData: project.fundFlow.monthlyData.map((m) => ({
              id: m.id,
              month: m.month,
              year: m.year,
              income: m.income,
              expense: m.expense,
              net: m.net,
              cumulative: m.cumulative,
            })),
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
    };

    const result = computeMonthlyBreakdown(sources);
    return result;
  });
}

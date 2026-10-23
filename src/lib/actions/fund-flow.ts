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
import { MONTHLY_ALLOCATION_WINDOW } from "@/lib/fund-flow-window";
import {
  computeStaffExp,
  computeTotalFee,
  computeMonthlyDistribution,
} from "@/lib/fund-flow-calcs";
import { withPermission, checkRateLimit, audit, sanitizeForAudit, ActionResult } from "./wrapper";

const windowKeys = new Set(
  MONTHLY_ALLOCATION_WINDOW.map((m) => `${m.year}-${m.month}`)
);

export async function upsertFundFlow(
  input: FundFlowUpdateInput
): Promise<ActionResult<{
  id: string;
  createdAllocations?: number;
  skippedOutsideWindow?: number;
  roundingResidual?: string;
}>> {
  return withPermission("fundFlow", "update", async (user) => {
    const parsed = fundFlowUpdateSchema.parse(input);
    const { projectId } = parsed;
    // fundFlowUpdateSchema derives via .partial(), but Zod keeps the
    // .default("0.00") on money fields — absent keys would parse to 0.00
    // and silently clobber stored values. Keep only keys the caller sent.
    const data: Partial<Omit<typeof parsed, "projectId">> = {};
    for (const k of Object.keys(input as Record<string, unknown>)) {
      const key = k as keyof typeof data;
      if ((key as string) !== "projectId" && parsed[key as keyof typeof parsed] !== undefined) {
        (data as Record<string, unknown>)[key] = parsed[key as keyof typeof parsed];
      }
    }
    await checkRateLimit(user.id);

    const result = await prisma.$transaction(async (tx) => {
      // Staff Exp. is recomputed server-side from its five confirmed
      // component fields whenever any component is supplied — never trust a
      // client-supplied total. When no component is touched, preserve the
      // stored total (legacy records predate the component fields).
      const existing = await tx.fundFlow.findUnique({
        where: { projectId },
        include: { monthlyData: true },
      });
      const merged = { ...(existing ?? {}), ...data } as typeof data;
      const newComponentKeys = [
        "teamLeaderExp",
        "residentialEngineerExp",
        "designEngineerExp",
        "siteEngineerExp",
      ] as const;
      // On an existing record only a supplied NEW component triggers a full
      // recomputation — Misc Exp alone never collapses a legacy staffExp
      // whose breakdown was never recorded; it adjusts the stored total by
      // the miscExp delta (identical result for component-managed records).
      const allComponentKeys = [...newComponentKeys, "miscExp" as const];
      const computeFromMerged = () =>
        computeStaffExp({
          teamLeaderExp: merged.teamLeaderExp ?? 0,
          residentialEngineerExp: merged.residentialEngineerExp ?? 0,
          designEngineerExp: merged.designEngineerExp ?? 0,
          siteEngineerExp: merged.siteEngineerExp ?? 0,
          miscExp: merged.miscExp ?? 0,
        });
      // Existing record: full recompute only on an explicit complete
      // breakdown (all four supplied AND at least one non-zero — the form
      // always sends all four, so "all zero" is an unchanged legacy form,
      // not an entered breakdown) or on a record already managed by
      // component fields. A lone Misc Exp edit adjusts the stored total by
      // the delta — never destroys a legacy total. Otherwise preserved.
      const hasStoredBreakdown =
        existing != null &&
        newComponentKeys.some((k) => new Decimal(existing[k].toString()).gt(0));
      const fullBreakdownEntered =
        newComponentKeys.every((k) => data[k] !== undefined) &&
        newComponentKeys.some((k) => !new Decimal((data[k] as Decimal).toString()).isZero());
      const staffExp = existing == null
        ? allComponentKeys.some((k) => data[k] !== undefined)
          ? computeFromMerged()
          : (data.staffExp ?? new Decimal("0.00"))
        : fullBreakdownEntered ||
            (hasStoredBreakdown && allComponentKeys.some((k) => data[k] !== undefined))
          ? computeFromMerged()
          : data.miscExp !== undefined
            ? new Decimal(existing.staffExp.toString())
                .plus(data.miscExp as Decimal)
                .minus(existing.miscExp.toString())
            : existing.staffExp;

      const { distributionStartMonth, distributionStartYear, feePercentage, ...rest } = data;
      const fundFlow = await tx.fundFlow.upsert({
        where: { projectId },
        create: {
          projectId,
          miscExp: merged.miscExp ?? new Decimal("0.00"),
          staffExp,
          teamLeaderExp: merged.teamLeaderExp ?? new Decimal("0.00"),
          residentialEngineerExp: merged.residentialEngineerExp ?? new Decimal("0.00"),
          designEngineerExp: merged.designEngineerExp ?? new Decimal("0.00"),
          siteEngineerExp: merged.siteEngineerExp ?? new Decimal("0.00"),
          totalProjectCost: merged.totalProjectCost ?? new Decimal("0.00"),
          completedWorkAmt: merged.completedWorkAmt ?? new Decimal("0.00"),
          feePercentage: feePercentage ?? null,
          proposedDueBillAmount: merged.proposedDueBillAmount ?? new Decimal("0.00"),
          feeReceived: merged.feeReceived ?? new Decimal("0.00"),
          distributionStartMonth: distributionStartMonth ?? null,
          distributionStartYear: distributionStartYear ?? null,
        },
        update: {
          ...rest,
          staffExp,
          ...(feePercentage !== undefined ? { feePercentage } : {}),
          ...(distributionStartMonth !== undefined ? { distributionStartMonth } : {}),
          ...(distributionStartYear !== undefined ? { distributionStartYear } : {}),
        },
      });

      // Total Fee = Total Project Cost × Fee percentage / 100 — recomputed
      // from the EFFECTIVE percentage (request value or the stored one), so
      // a Total Project Cost change alone keeps Total Fee and remaing fee
      // correct. Records with no percentage anywhere keep their stored fee.
      const effectivePct =
        feePercentage !== undefined ? feePercentage : existing?.feePercentage ?? null;
      if (effectivePct != null) {
        const totalFee = computeTotalFee(fundFlow.totalProjectCost, effectivePct);
        await tx.project.update({
          where: { id: projectId },
          data: { totalFee },
        });
      }

      // Initial remaing-fee distribution: only when the employee picked a
      // Start month, no saved allocations exist yet, and there is a
      // remaining fee to spread over Target Time Limit (In Month).
      let createdAllocations = 0;
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { targetTimeLimitMonths: true },
      });
      const startM = fundFlow.distributionStartMonth;
      const startY = fundFlow.distributionStartYear;
      const targetTl = project?.targetTimeLimitMonths;
      const existingCount = existing?.monthlyData.length ?? 0;
      if (
        startM != null && startY != null && existingCount === 0 &&
        targetTl != null && targetTl.gt(0)
      ) {
        const totalFee = (await tx.project.findUnique({
          where: { id: projectId },
          select: { totalFee: true },
        }))!.totalFee;
        const remainingFee = new Decimal(totalFee.toString()).minus(
          fundFlow.feeReceived.toString()
        );
        if (remainingFee.gt(0)) {
          const perMonth = computeMonthlyDistribution(
            remainingFee,
            targetTl.toNumber()
          );
          let cursor = { y: startY, m: startM };
          const n = Math.floor(targetTl.toNumber());
          let skippedOutside = 0;
          for (let i = 0; i < n; i++) {
            if (windowKeys.has(`${cursor.y}-${cursor.m}`)) {
              const rec = await tx.fundFlowMonthly.create({
                data: {
                  fundFlowId: fundFlow.id,
                  month: cursor.m,
                  year: cursor.y,
                  income: perMonth,
                },
              });
              // Same provenance marker applyMonthlyPlan writes — without it the
              // monthly report treats these saved allocations as ambiguous and
              // excludes them from Total Income per Month (Row 12).
              await tx.auditLog.create({
                data: {
                  userId: user.id,
                  action: "create",
                  entity: "FundFlowMonthly",
                  entityId: rec.id,
                  metadata: {
                    source: "ff-01k-workbook-allocation",
                    generatedBy: "fund-flow-initial-distribution",
                  },
                },
              });
              createdAllocations++;
            } else {
              skippedOutside++;
            }
            cursor = cursor.m === 12 ? { y: cursor.y + 1, m: 1 } : { y: cursor.y, m: cursor.m + 1 };
          }
          // Rounding residual of the full plan (perMonth rounded to 6dp × n),
          // reported separately from months skipped outside the window.
          const residual = remainingFee.minus(perMonth.mul(n));
          return {
            fundFlow,
            createdAllocations,
            skippedOutside,
            roundingResidual: residual.toString(),
          };
        }
      }

      return { fundFlow, createdAllocations };
    });

    await audit(user.id, "upsert", "FundFlow", result.fundFlow.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    return {
      id: result.fundFlow.id,
      createdAllocations: result.createdAllocations,
      skippedOutsideWindow: (result as { skippedOutside?: number }).skippedOutside ?? 0,
      roundingResidual:
        (result as { roundingResidual?: string }).roundingResidual ?? "0",
    };
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

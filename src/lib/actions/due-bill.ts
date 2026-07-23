"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { DueBillStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dueBillCreateSchema,
  dueBillUpdateSchema,
  dueBillFilterSchema,
  DueBillCreateInput,
  DueBillUpdateInput,
  DueBillFilterInput,
} from "@/lib/schemas/due-bill";
import { buildDueBillsWhere } from "@/lib/queries/due-bills";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

function computeBillAmounts(
  grossAmount: Decimal,
  sgst: Decimal,
  cgst: Decimal,
  chequeAmount: Decimal,
  sd: Decimal,
  itTds: Decimal
) {
  const billAmount = new Decimal(grossAmount.toString())
    .plus(sgst.toString())
    .plus(cgst.toString());
  const receivedAmount = new Decimal(chequeAmount.toString())
    .plus(sd.toString())
    .plus(itTds.toString());
  return { billAmount, receivedAmount };
}

function computeStatus(
  billAmount: Decimal,
  receivedAmount: Decimal,
  explicitStatus?: DueBillStatus
): DueBillStatus {
  if (explicitStatus && explicitStatus !== DueBillStatus.PENDING) {
    return explicitStatus;
  }
  if (receivedAmount.greaterThanOrEqualTo(billAmount) && billAmount.greaterThan(0)) {
    return DueBillStatus.PAID;
  }
  if (receivedAmount.greaterThan(0)) {
    return DueBillStatus.PARTIAL;
  }
  return DueBillStatus.PENDING;
}

async function syncFundFlowFeeReceived(projectId: string): Promise<void> {
  const result = await prisma.dueBill.aggregate({
    where: { projectId },
    _sum: { receivedAmount: true },
  });

  const totalReceived = result._sum.receivedAmount ?? new Decimal("0");

  await prisma.fundFlow.update({
    where: { projectId },
    data: { feeReceived: totalReceived },
  }).catch(() => {
    return prisma.fundFlow.create({
      data: {
        projectId,
        feeReceived: totalReceived,
      },
    });
  });
}

export async function createDueBill(
  input: DueBillCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("dueBills", "create", async (user) => {
    const parsed = dueBillCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const { billAmount, receivedAmount } = computeBillAmounts(
      parsed.grossAmount,
      parsed.sgst,
      parsed.cgst,
      parsed.chequeAmount,
      parsed.sd,
      parsed.itTds
    );
    const status = computeStatus(billAmount, receivedAmount, parsed.status);

    const dueBill = await prisma.dueBill.create({
      data: {
        projectId: parsed.projectId,
        scheme: parsed.scheme,
        grossAmount: parsed.grossAmount,
        sgst: parsed.sgst,
        cgst: parsed.cgst,
        billAmount,
        chequeAmount: parsed.chequeAmount,
        sd: parsed.sd,
        itTds: parsed.itTds,
        receivedAmount,
        billDate: parsed.billDate,
        receiveDate: parsed.receiveDate,
        status,
        remarks: parsed.remarks,
      },
    });

    await audit(user.id, "create", "DueBill", dueBill.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    // Sync FundFlow.feeReceived with sum of DueBill.receivedAmount for this project
    await syncFundFlowFeeReceived(parsed.projectId);

    revalidatePath("/dashboard/due-bills");
    revalidatePath("/dashboard/fund-flow");
    return { id: dueBill.id };
  });
}

export async function updateDueBill(
  input: DueBillUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("dueBills", "update", async (user) => {
    const parsed = dueBillUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.dueBill.findUnique({ where: { id } });
    if (!existing) {
      throw new Error("Due bill not found");
    }

    const grossAmount = data.grossAmount ?? existing.grossAmount;
    const sgst = data.sgst ?? existing.sgst;
    const cgst = data.cgst ?? existing.cgst;
    const chequeAmount = data.chequeAmount ?? existing.chequeAmount;
    const sd = data.sd ?? existing.sd;
    const itTds = data.itTds ?? existing.itTds;

    const { billAmount, receivedAmount } = computeBillAmounts(
      grossAmount,
      sgst,
      cgst,
      chequeAmount,
      sd,
      itTds
    );
    const status = computeStatus(billAmount, receivedAmount, data.status);

    const dueBill = await prisma.dueBill.update({
      where: { id },
      data: {
        ...data,
        billAmount,
        receivedAmount,
        status,
      },
    });

    await audit(user.id, "update", "DueBill", dueBill.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    // Sync FundFlow.feeReceived with sum of DueBill.receivedAmount for this project
    await syncFundFlowFeeReceived(dueBill.projectId);

    revalidatePath("/dashboard/due-bills");
    revalidatePath("/dashboard/fund-flow");
    return { id: dueBill.id };
  });
}

export async function deleteDueBill(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("dueBills", "delete", async (user) => {
    await checkRateLimit(user.id);

    const dueBill = await prisma.dueBill.delete({ where: { id } });

    await audit(user.id, "delete", "DueBill", dueBill.id, {});

    // Sync FundFlow after deletion
    await syncFundFlowFeeReceived(dueBill.projectId);

    revalidatePath("/dashboard/due-bills");
    revalidatePath("/dashboard/fund-flow");
    return { id: dueBill.id };
  });
}

export async function getDueBills(
  filter?: DueBillFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("dueBills", "read", async () => {
    const parsed = filter ? dueBillFilterSchema.parse(filter) : undefined;
    const where = buildDueBillsWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.dueBill.findMany({
        where,
        include: {
          project: {
            include: {
              client: true,
              region: true,
            },
          },
        },
        orderBy: { billDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.dueBill.count({ where }),
    ]);

    const computedRows = rows.map((dueBill) => {
      const pendingAmount = new Decimal(dueBill.billAmount.toString()).minus(
        dueBill.receivedAmount.toString()
      );
      const computedStatus = computeStatus(
        dueBill.billAmount,
        dueBill.receivedAmount,
        dueBill.status
      );
      return {
        ...dueBill,
        pendingAmount,
        computedStatus,
      };
    });

    return { rows: computedRows, total };
  });
}

export async function getDueBillById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("dueBills", "read", async () => {
    const dueBill = await prisma.dueBill.findUnique({
      where: { id },
      include: {
        project: {
          include: {
            client: true,
            region: true,
          },
        },
      },
    });

    if (!dueBill) return null;

    const pendingAmount = new Decimal(dueBill.billAmount.toString()).minus(
      dueBill.receivedAmount.toString()
    );
    const computedStatus = computeStatus(
      dueBill.billAmount,
      dueBill.receivedAmount,
      dueBill.status
    );

    return { ...dueBill, pendingAmount, computedStatus };
  });
}

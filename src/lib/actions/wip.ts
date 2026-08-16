"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  wipCreateSchema,
  wipUpdateSchema,
  wipFilterSchema,
  WipCreateInput,
  WipUpdateInput,
  WipFilterInput,
} from "@/lib/schemas/wip";
import { buildWipWhere } from "@/lib/queries/wip";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";
import { createWipLinkedTasks, deleteLinkedTasks } from "./task-linking";

function toDecimal(value: Decimal | null | undefined): Decimal {
  return value ? new Decimal(value.toString()) : new Decimal("0.00");
}

function computeRaTotals(row: {
  raBill1Amount: Decimal | null;
  raBill2Amount: Decimal | null;
  raBill3Amount: Decimal | null;
  raBill4Amount: Decimal | null;
  raBill1SaecFee: Decimal | null;
  raBill2SaecFee: Decimal | null;
  raBill3SaecFee: Decimal | null;
  raBill4SaecFee: Decimal | null;
  raBill1ProjectExpense: Decimal | null;
  raBill2ProjectExpense: Decimal | null;
  raBill3ProjectExpense: Decimal | null;
  raBill4ProjectExpense: Decimal | null;
  amountOfWorkDone: Decimal | null;
}) {
  const totalRaAmount = toDecimal(row.raBill1Amount)
    .plus(toDecimal(row.raBill2Amount))
    .plus(toDecimal(row.raBill3Amount))
    .plus(toDecimal(row.raBill4Amount))
    .toDecimalPlaces(2);

  const totalSaecFee = toDecimal(row.raBill1SaecFee)
    .plus(toDecimal(row.raBill2SaecFee))
    .plus(toDecimal(row.raBill3SaecFee))
    .plus(toDecimal(row.raBill4SaecFee))
    .toDecimalPlaces(2);

  const totalProjectExpense = toDecimal(row.raBill1ProjectExpense)
    .plus(toDecimal(row.raBill2ProjectExpense))
    .plus(toDecimal(row.raBill3ProjectExpense))
    .plus(toDecimal(row.raBill4ProjectExpense))
    .toDecimalPlaces(2);

  const amountOfWorkDone = toDecimal(row.amountOfWorkDone);
  const balanceWorkAmount = amountOfWorkDone
    .minus(totalRaAmount)
    .toDecimalPlaces(2);

  return {
    totalRaAmount,
    totalSaecFee,
    totalProjectExpense,
    balanceWorkAmount,
  };
}

export async function createWip(
  input: WipCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("wip", "create", async (user) => {
    const parsed = wipCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const wip = await prisma.$transaction(async (tx) => {
      const created = await tx.workInProgress.create({
        data: {
          projectId: parsed.projectId,
          status: parsed.status,
          loiReceiptDate: parsed.loiReceiptDate,
          loiCopyPath: parsed.loiCopyPath,
          agreementDate: parsed.agreementDate,
          agreementCopyPath: parsed.agreementCopyPath,
          workOrderDate: parsed.workOrderDate,
          workOrderCopyPath: parsed.workOrderCopyPath,
          timeLimitMonths: parsed.timeLimitMonths,
          stipulatedCompletionDate: parsed.stipulatedCompletionDate,
          targetCompletionDate: parsed.targetCompletionDate,
          hoCoordinatorId: parsed.hoCoordinatorId,
          roCoordinatorId: parsed.roCoordinatorId,
          securityDepositAmount: parsed.securityDepositAmount,
          securityDepositStatus: parsed.securityDepositStatus,
          securityDepositReturnDate: parsed.securityDepositReturnDate,
          securityDepositCopyPath: parsed.securityDepositCopyPath,
          amountOfWorkDone: parsed.amountOfWorkDone,
          finalProgressAmount: parsed.finalProgressAmount,
          finalProgressPath: parsed.finalProgressPath,
          raBill1Amount: parsed.raBill1Amount,
          raBill1Date: parsed.raBill1Date,
          raBill1SaecFee: parsed.raBill1SaecFee,
          raBill1ProjectExpense: parsed.raBill1ProjectExpense,
          raBill1Path: parsed.raBill1Path,
          raBill2Amount: parsed.raBill2Amount,
          raBill2Date: parsed.raBill2Date,
          raBill2SaecFee: parsed.raBill2SaecFee,
          raBill2ProjectExpense: parsed.raBill2ProjectExpense,
          raBill2Path: parsed.raBill2Path,
          raBill3Amount: parsed.raBill3Amount,
          raBill3Date: parsed.raBill3Date,
          raBill3SaecFee: parsed.raBill3SaecFee,
          raBill3ProjectExpense: parsed.raBill3ProjectExpense,
          raBill3Path: parsed.raBill3Path,
          raBill4Amount: parsed.raBill4Amount,
          raBill4Date: parsed.raBill4Date,
          raBill4SaecFee: parsed.raBill4SaecFee,
          raBill4ProjectExpense: parsed.raBill4ProjectExpense,
          raBill4Path: parsed.raBill4Path,
          annexure3aPath: parsed.annexure3aPath,
          completionCertificatePath: parsed.completionCertificatePath,
          completionDate: parsed.completionDate,
          remarks: parsed.remarks,
          assignments: parsed.assignments
            ? {
                create: parsed.assignments.map((a) => ({
                  staffId: a.staffId,
                  level: a.level,
                })),
              }
            : undefined,
        },
      });
      return created;
    });

    await audit(user.id, "create", "WorkInProgress", wip.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    // Auto-create linked tasks for LOI, Agreement, Work Order, Security Deposit, RA Bills, 3A Certificate
    await createWipLinkedTasks({
      wipId: wip.id,
      projectId: parsed.projectId,
      loiReceiptDate: parsed.loiReceiptDate,
      agreementDate: parsed.agreementDate,
      workOrderDate: parsed.workOrderDate,
      securityDepositReturnDate: parsed.securityDepositReturnDate,
      raBill1Date: parsed.raBill1Date,
      raBill1Amount: parsed.raBill1Amount,
      raBill1Path: parsed.raBill1Path,
      raBill2Date: parsed.raBill2Date,
      raBill2Amount: parsed.raBill2Amount,
      raBill2Path: parsed.raBill2Path,
      raBill3Date: parsed.raBill3Date,
      raBill3Amount: parsed.raBill3Amount,
      raBill3Path: parsed.raBill3Path,
      raBill4Date: parsed.raBill4Date,
      raBill4Amount: parsed.raBill4Amount,
      raBill4Path: parsed.raBill4Path,
      annexure3aPath: parsed.annexure3aPath,
      completionDate: parsed.completionDate,
      hoCoordinatorId: parsed.hoCoordinatorId,
      roCoordinatorId: parsed.roCoordinatorId,
    }).catch(() => {});

    revalidatePath("/dashboard/wip");
    revalidatePath("/dashboard/tasks");
    return { id: wip.id };
  });
}

export async function updateWip(
  input: WipUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("wip", "update", async (user) => {
    const parsed = wipUpdateSchema.parse(input);
    const { id, assignments, ...data } = parsed;
    await checkRateLimit(user.id);

    const wip = await prisma.$transaction(async (tx) => {
      const existing = await tx.workInProgress.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Work in progress not found");
      }

      const updated = await tx.workInProgress.update({
        where: { id },
        data,
      });

      if (assignments) {
        await tx.wipAssignment.deleteMany({ where: { workInProgressId: id } });
        await tx.wipAssignment.createMany({
          data: assignments.map((a) => ({
            workInProgressId: id,
            staffId: a.staffId,
            level: a.level,
          })),
        });
      }

      return updated;
    });

    await audit(user.id, "update", "WorkInProgress", wip.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    // Auto-create linked tasks for any newly added dates, RA bills, or completion certificates
    await createWipLinkedTasks({
      wipId: wip.id,
      projectId: wip.projectId,
      loiReceiptDate: parsed.loiReceiptDate,
      agreementDate: parsed.agreementDate,
      workOrderDate: parsed.workOrderDate,
      securityDepositReturnDate: parsed.securityDepositReturnDate,
      raBill1Date: parsed.raBill1Date,
      raBill1Amount: parsed.raBill1Amount,
      raBill1Path: parsed.raBill1Path,
      raBill2Date: parsed.raBill2Date,
      raBill2Amount: parsed.raBill2Amount,
      raBill2Path: parsed.raBill2Path,
      raBill3Date: parsed.raBill3Date,
      raBill3Amount: parsed.raBill3Amount,
      raBill3Path: parsed.raBill3Path,
      raBill4Date: parsed.raBill4Date,
      raBill4Amount: parsed.raBill4Amount,
      raBill4Path: parsed.raBill4Path,
      annexure3aPath: parsed.annexure3aPath,
      completionDate: parsed.completionDate,
      hoCoordinatorId: parsed.hoCoordinatorId,
      roCoordinatorId: parsed.roCoordinatorId,
    }).catch(() => {});

    revalidatePath("/dashboard/wip");
    revalidatePath("/dashboard/tasks");
    return { id: wip.id };
  });
}

export async function deleteWip(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("wip", "delete", async (user) => {
    await checkRateLimit(user.id);

    const wip = await prisma.workInProgress.delete({ where: { id } });

    await deleteLinkedTasks("WIP", id).catch(() => {});

    await audit(user.id, "delete", "WorkInProgress", wip.id, {});

    revalidatePath("/dashboard/wip");
    return { id: wip.id };
  });
}

export async function getWips(
  filter?: WipFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("wip", "read", async () => {
    const parsed = filter ? wipFilterSchema.parse(filter) : undefined;
    const where = buildWipWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.workInProgress.findMany({
        where,
        include: {
          project: {
            include: {
              client: true,
              region: true,
            },
          },
          assignments: {
            include: {
              staff: true,
            },
          },
          hoCoordinator: true,
          roCoordinator: true,
        },
        orderBy: { workOrderDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.workInProgress.count({ where }),
    ]);

    const computedRows = rows.map((wip) => ({
      ...wip,
      ...computeRaTotals(wip),
    }));

    return { rows: computedRows, total };
  });
}

export async function getWipById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("wip", "read", async () => {
    const wip = await prisma.workInProgress.findUnique({
      where: { id },
      include: {
        project: {
          include: {
            client: true,
            region: true,
          },
        },
        assignments: {
          include: {
            staff: true,
          },
        },
        hoCoordinator: true,
        roCoordinator: true,
      },
    });

    if (!wip) return null;

    return { ...wip, ...computeRaTotals(wip) };
  });
}

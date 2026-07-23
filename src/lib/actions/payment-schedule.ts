"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  paymentScheduleCreateSchema,
  paymentScheduleUpdateSchema,
  paymentScheduleFilterSchema,
  PaymentScheduleCreateInput,
  PaymentScheduleUpdateInput,
  PaymentScheduleFilterInput,
} from "@/lib/schemas/payment-schedule";
import { buildPaymentScheduleWhere } from "@/lib/queries/payment-schedules";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

function computeIsOverdue(
  status: string,
  dueDate: Date | null
): boolean {
  if (status === "PAID" || status === "CANCELLED" || !dueDate) return false;
  return new Date(dueDate) < new Date();
}

export async function createPaymentSchedule(
  input: PaymentScheduleCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("paymentSchedules", "create", async (user) => {
    const parsed = paymentScheduleCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const paymentSchedule = await prisma.paymentSchedule.create({
      data: parsed,
    });

    await audit(user.id, "create", "PaymentSchedule", paymentSchedule.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/payment-schedules");
    return { id: paymentSchedule.id };
  });
}

export async function updatePaymentSchedule(
  input: PaymentScheduleUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("paymentSchedules", "update", async (user) => {
    const parsed = paymentScheduleUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const paymentSchedule = await prisma.paymentSchedule.update({
      where: { id },
      data,
    });

    await audit(user.id, "update", "PaymentSchedule", paymentSchedule.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/payment-schedules");
    return { id: paymentSchedule.id };
  });
}

export async function deletePaymentSchedule(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("paymentSchedules", "delete", async (user) => {
    await checkRateLimit(user.id);

    const paymentSchedule = await prisma.paymentSchedule.delete({
      where: { id },
    });

    await audit(user.id, "delete", "PaymentSchedule", paymentSchedule.id, {});

    revalidatePath("/dashboard/payment-schedules");
    return { id: paymentSchedule.id };
  });
}

export async function getPaymentSchedules(
  filter?: PaymentScheduleFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("paymentSchedules", "read", async () => {
    const parsed = filter
      ? paymentScheduleFilterSchema.parse(filter)
      : undefined;
    const where = buildPaymentScheduleWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.paymentSchedule.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.paymentSchedule.count({ where }),
    ]);

    const computedRows = rows.map((row) => ({
      ...row,
      isOverdue: computeIsOverdue(row.status, row.dueDate),
    }));

    return { rows: computedRows, total };
  });
}

export async function getPaymentScheduleById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("paymentSchedules", "read", async () => {
    const paymentSchedule = await prisma.paymentSchedule.findUnique({
      where: { id },
    });

    if (!paymentSchedule) return null;

    return {
      ...paymentSchedule,
      isOverdue: computeIsOverdue(
        paymentSchedule.status,
        paymentSchedule.dueDate
      ),
    };
  });
}

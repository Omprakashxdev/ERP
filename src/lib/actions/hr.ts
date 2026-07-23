"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  withPermission,
  checkRateLimit,
  audit,
  ActionResult,
} from "./wrapper";
import {
  employeeDetailCreateSchema,
  employeeDetailUpdateSchema,
  employeeFilterSchema,
  EmployeeDetailCreateInput,
  EmployeeDetailUpdateInput,
  EmployeeFilterInput,
} from "@/lib/schemas/hr";
import { buildEmployeeWhere } from "@/lib/queries/hr";

export async function getEmployees(
  filter?: EmployeeFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("hr", "read", async () => {
    const parsed = filter ? employeeFilterSchema.parse(filter) : undefined;
    const where = buildEmployeeWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        include: {
          employeeDetail: true,
          region: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.staff.count({ where }),
    ]);

    return { rows, total };
  });
}

export async function getEmployeeById(
  id: string
): Promise<ActionResult<unknown>> {
  return withPermission("hr", "read", async () => {
    return prisma.staff.findUnique({
      where: { id },
      include: { employeeDetail: true, region: true },
    });
  });
}

export async function createEmployeeDetail(
  input: EmployeeDetailCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("hr", "create", async (user) => {
    const parsed = employeeDetailCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const detail = await prisma.employeeDetail.create({
      data: parsed as never,
    });

    await audit(user.id, "create", "EmployeeDetail", detail.id, {
      staffId: parsed.staffId,
    });

    revalidatePath("/dashboard/hr");
    return { id: detail.id };
  });
}

export async function updateEmployeeDetail(
  input: EmployeeDetailUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("hr", "update", async (user) => {
    const parsed = employeeDetailUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const detail = await prisma.employeeDetail.update({
      where: { id },
      data: data as never,
    });

    await audit(user.id, "update", "EmployeeDetail", detail.id, {});

    revalidatePath("/dashboard/hr");
    return { id: detail.id };
  });
}

export async function upsertEmployeeDetail(
  input: EmployeeDetailCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("hr", "update", async (user) => {
    const parsed = employeeDetailCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const detail = await prisma.employeeDetail.upsert({
      where: { staffId: parsed.staffId },
      create: parsed as never,
      update: parsed as never,
    });

    await audit(user.id, "upsert", "EmployeeDetail", detail.id, {
      staffId: parsed.staffId,
    });

    revalidatePath("/dashboard/hr");
    return { id: detail.id };
  });
}

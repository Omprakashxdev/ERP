"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Role } from "@/types/auth";
import {
  staffCreateSchema,
  staffUpdateSchema,
  staffFilterSchema,
  StaffCreateInput,
  StaffUpdateInput,
  StaffFilterInput,
} from "@/lib/schemas/staff";
import { withAuth, checkRateLimit, audit, sanitizeForAudit, ActionResult } from "./wrapper";

const mutationRoles = [Role.ADMIN, Role.MANAGER];

export async function createStaff(
  input: StaffCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = staffCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const staff = await prisma.staff.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        employeeCode: parsed.employeeCode,
        designation: parsed.designation,
        regionId: parsed.regionId,
        isActive: parsed.isActive,
      },
      select: { id: true },
    });

    await audit(user.id, "create", "Staff", staff.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    return staff;
  }, mutationRoles);
}

export async function updateStaff(
  input: StaffUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = staffUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const staff = await prisma.staff.update({
      where: { id },
      data,
      select: { id: true },
    });

    await audit(user.id, "update", "Staff", staff.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    return staff;
  }, mutationRoles);
}

export async function getStaff(
  filter?: StaffFilterInput
): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    const parsed = filter ? staffFilterSchema.parse(filter) : undefined;
    const where: Record<string, unknown> = {};
    if (parsed?.search) {
      where.name = { contains: parsed.search, mode: "insensitive" };
    }
    if (parsed?.regionId) {
      where.regionId = parsed.regionId;
    }
    if (typeof parsed?.isActive === "boolean") {
      where.isActive = parsed.isActive;
    }

    const staff = await prisma.staff.findMany({
      where,
      include: { region: true },
      orderBy: { name: "asc" },
    });

    return staff;
  });
}

export async function getStaffById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withAuth(async () => {
    const staff = await prisma.staff.findUnique({
      where: { id },
      include: { region: true },
    });
    return staff;
  });
}

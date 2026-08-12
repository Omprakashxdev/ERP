"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Role } from "@/types/auth";
import { withAuth, audit, ActionResult } from "./wrapper";

const mutationRoles = [Role.ADMIN, Role.MANAGER];

// ─── Master type definitions ─────────────────────────────────

export type MasterType =
  | "region"
  | "department"
  | "designation"
  | "state"
  | "city"
  | "platform"
  | "paymentType"
  | "assetCategory"
  | "assetMake"
  | "assetModel"
  | "orderMaster"
  | "workMaster"
  | "dprMaster"
  | "tsAaMaster";

interface MasterInput {
  id?: string;
  name?: string;
  referenceNumber?: string;
  url?: string;
  stateId?: string;
  makeId?: string;
}

// ─── Generic CRUD ────────────────────────────────────────────

export async function getMasterList(
  type: MasterType,
  search?: string
): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    const where = search
      ? type === "dprMaster" || type === "tsAaMaster"
        ? { referenceNumber: { contains: search, mode: "insensitive" as const } }
        : { name: { contains: search, mode: "insensitive" as const } }
      : {};

    const include =
      type === "city"
        ? { state: true }
        : type === "assetModel"
        ? { make: true }
        : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (prisma as any)[type].findMany({
      where,
      include,
      orderBy:
        type === "dprMaster" || type === "tsAaMaster"
          ? { referenceNumber: "asc" }
          : { name: "asc" },
    });

    return items;
  });
}

export async function createMaster(
  type: MasterType,
  input: MasterInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const data: Record<string, unknown> = {};
    if (type === "dprMaster" || type === "tsAaMaster") {
      data.referenceNumber = input.referenceNumber;
    } else {
      data.name = input.name;
    }
    if (type === "platform" && input.url) data.url = input.url;
    if (type === "city" && input.stateId) data.stateId = input.stateId;
    if (type === "assetModel" && input.makeId) data.makeId = input.makeId;

    // Check for duplicate names on city to ensure uniqueness
    if (type === "city" && input.name) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (prisma as any).city.findFirst({
        where: { name: { equals: input.name, mode: "insensitive" } },
      });
      if (existing) {
        throw new Error(`City "${input.name}" already exists. City names must be unique.`);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = await (prisma as any)[type].create({ data, select: { id: true } });

    await audit(user.id, "create", type, item.id, { input });
    revalidatePath("/dashboard/masters");
    return item;
  }, mutationRoles);
}

export async function updateMaster(
  type: MasterType,
  input: MasterInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const { id, ...rest } = input;
    const data: Record<string, unknown> = {};
    if (type === "dprMaster" || type === "tsAaMaster") {
      if (rest.referenceNumber !== undefined) data.referenceNumber = rest.referenceNumber;
    } else {
      if (rest.name !== undefined) data.name = rest.name;
    }
    if (type === "platform" && rest.url !== undefined) data.url = rest.url;
    if (type === "city" && rest.stateId !== undefined) data.stateId = rest.stateId;
    if (type === "assetModel" && rest.makeId !== undefined) data.makeId = rest.makeId;

    // Check for duplicate names on city update (excluding current record)
    if (type === "city" && rest.name !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (prisma as any).city.findFirst({
        where: {
          name: { equals: rest.name, mode: "insensitive" },
          NOT: { id },
        },
      });
      if (existing) {
        throw new Error(`City "${rest.name}" already exists. City names must be unique.`);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = await (prisma as any)[type].update({ where: { id }, data, select: { id: true } });

    await audit(user.id, "update", type, item.id, { input });
    revalidatePath("/dashboard/masters");
    return item;
  }, mutationRoles);
}

export async function deleteMaster(
  type: MasterType,
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = await (prisma as any)[type].delete({ where: { id }, select: { id: true } });
    await audit(user.id, "delete", type, id, {});
    revalidatePath("/dashboard/masters");
    return item;
  }, mutationRoles);
}

// ─── Lookup helpers for forms ────────────────────────────────

export async function getDepartments() {
  return withAuth(async () => {
    return prisma.department.findMany({ orderBy: { name: "asc" } });
  });
}

export async function getDesignations() {
  return withAuth(async () => {
    return prisma.designation.findMany({ orderBy: { name: "asc" } });
  });
}

export async function getStates() {
  return withAuth(async () => {
    return prisma.state.findMany({ orderBy: { name: "asc" } });
  });
}

export async function getCities() {
  return withAuth(async () => {
    return prisma.city.findMany({ include: { state: true }, orderBy: { name: "asc" } });
  });
}

export async function getPlatforms() {
  return withAuth(async () => {
    return prisma.platform.findMany({ orderBy: { name: "asc" } });
  });
}

export async function getPaymentTypes() {
  return withAuth(async () => {
    return prisma.paymentType.findMany({ orderBy: { name: "asc" } });
  });
}

export async function getAssetCategories() {
  return withAuth(async () => {
    return prisma.assetCategory.findMany({ orderBy: { name: "asc" } });
  });
}

export async function getAssetMakes() {
  return withAuth(async () => {
    return prisma.assetMake.findMany({ orderBy: { name: "asc" } });
  });
}

export async function getAssetModels() {
  return withAuth(async () => {
    return prisma.assetModel.findMany({ include: { make: true }, orderBy: { name: "asc" } });
  });
}

export async function getOrderMasters() {
  return withAuth(async () => {
    return prisma.orderMaster.findMany({ orderBy: { name: "asc" } });
  });
}

export async function getWorkMasters() {
  return withAuth(async () => {
    return prisma.workMaster.findMany({ orderBy: { name: "asc" } });
  });
}

export async function getDprMasters() {
  return withAuth(async () => {
    return prisma.dprMaster.findMany({ orderBy: { referenceNumber: "asc" } });
  });
}

export async function getTsAaMasters() {
  return withAuth(async () => {
    return prisma.tsAaMaster.findMany({ orderBy: { referenceNumber: "asc" } });
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Role } from "@/types/auth";
import {
  regionCreateSchema,
  regionUpdateSchema,
  regionFilterSchema,
  RegionCreateInput,
  RegionUpdateInput,
  RegionFilterInput,
} from "@/lib/schemas/region";
import { withAuth, checkRateLimit, audit, sanitizeForAudit, ActionResult } from "./wrapper";

const mutationRoles = [Role.ADMIN, Role.MANAGER];

export async function createRegion(
  input: RegionCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = regionCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const region = await prisma.region.create({
      data: {
        name: parsed.name,
        abbreviation: parsed.abbreviation,
        address: parsed.address,
      },
      select: { id: true },
    });

    await audit(user.id, "create", "Region", region.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    return region;
  }, mutationRoles);
}

export async function updateRegion(
  input: RegionUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = regionUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const region = await prisma.region.update({
      where: { id },
      data,
      select: { id: true },
    });

    await audit(user.id, "update", "Region", region.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    return region;
  }, mutationRoles);
}

export async function getRegions(
  filter?: RegionFilterInput
): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    const parsed = filter ? regionFilterSchema.parse(filter) : undefined;
    const where = parsed?.search
      ? { name: { contains: parsed.search, mode: "insensitive" as const } }
      : {};

    const regions = await prisma.region.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return regions;
  });
}

export async function getRegionById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withAuth(async () => {
    const region = await prisma.region.findUnique({ where: { id } });
    return region;
  });
}

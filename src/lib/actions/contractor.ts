"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  contractorCreateSchema,
  contractorUpdateSchema,
  contractorFilterSchema,
  ContractorCreateInput,
  ContractorUpdateInput,
  ContractorFilterInput,
} from "@/lib/schemas/contractor";
import { buildContractorWhere } from "@/lib/queries/contractor";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

export async function createContractor(
  input: ContractorCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("contractors", "create", async (user) => {
    const parsed = contractorCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const contractor = await prisma.contractor.create({
      data: parsed,
    });

    await audit(user.id, "create", "Contractor", contractor.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/contractors");
    return { id: contractor.id };
  });
}

export async function updateContractor(
  input: ContractorUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("contractors", "update", async (user) => {
    const parsed = contractorUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const contractor = await prisma.contractor.update({
      where: { id },
      data,
    });

    await audit(user.id, "update", "Contractor", contractor.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/contractors");
    return { id: contractor.id };
  });
}

export async function deleteContractor(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("contractors", "delete", async (user) => {
    await checkRateLimit(user.id);

    const contractor = await prisma.contractor.delete({ where: { id } });

    await audit(user.id, "delete", "Contractor", contractor.id, {});

    revalidatePath("/dashboard/contractors");
    return { id: contractor.id };
  });
}

export async function getContractors(
  filter?: ContractorFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("contractors", "read", async () => {
    const parsed = filter ? contractorFilterSchema.parse(filter) : undefined;
    const where = buildContractorWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.contractor.findMany({
        where,
        include: {
          _count: {
            select: { projects: true },
          },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contractor.count({ where }),
    ]);

    return { rows, total };
  });
}

export async function getContractorById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("contractors", "read", async () => {
    const contractor = await prisma.contractor.findUnique({
      where: { id },
      include: {
        _count: {
          select: { projects: true },
        },
      },
    });

    return contractor;
  });
}

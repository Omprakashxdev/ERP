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

/** Existing tender advertisement IDs for the contractor form — avoids
    retyping an ID that already exists on a Tender record. */
export async function getTenderIdSuggestions(): Promise<
  ActionResult<{ tenderId: string; name: string }[]>
> {
  return withPermission("contractors", "read", async () => {
    const rows = await prisma.tender.findMany({
      where: { tenderId: { not: null } },
      select: { tenderId: true, name: true },
      orderBy: { tenderDate: "desc" },
      take: 200,
    });
    return rows
      .filter((r): r is { tenderId: string; name: string } => !!r.tenderId)
      .map((r) => ({ tenderId: r.tenderId, name: r.name }));
  });
}

/** Read-only RA bills on this contractor's explicitly linked projects.
    Only returns the contractor's own projects' WIP bill slots — never
    another contractor's data, never invented records. */
export async function getContractorLinkedRaBills(
  contractorId: string
): Promise<
  ActionResult<
    {
      projectName: string;
      billNo: number;
      date: Date | null;
      amount: string | null;
      woNo: string | null;
      details: string | null;
      documentPath: string | null;
      certificatePath: string | null;
      testCopyPath: string | null;
    }[]
  >
> {
  return withPermission("contractors", "read", async () => {
    const contractor = await prisma.contractor.findUnique({
      where: { id: contractorId },
      include: {
        projects: {
          select: { id: true, name: true },
        },
      },
    });
    if (!contractor) return [];

    const projectIds = contractor.projects.map((p) => p.id);
    const wips = await prisma.workInProgress.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        projectId: true,
        raBill1Date: true, raBill1Amount: true, raBill1Path: true,
        raBill1WoNo: true, raBill1Details: true,
        raBill1CertificatePath: true, raBill1TestCopyPath: true,
        raBill2Date: true, raBill2Amount: true, raBill2Path: true,
        raBill2WoNo: true, raBill2Details: true,
        raBill2CertificatePath: true, raBill2TestCopyPath: true,
        raBill3Date: true, raBill3Amount: true, raBill3Path: true,
        raBill3WoNo: true, raBill3Details: true,
        raBill3CertificatePath: true, raBill3TestCopyPath: true,
        raBill4Date: true, raBill4Amount: true, raBill4Path: true,
        raBill4WoNo: true, raBill4Details: true,
        raBill4CertificatePath: true, raBill4TestCopyPath: true,
      },
    });

    const nameByProject = new Map(contractor.projects.map((p) => [p.id, p.name]));
    const rows: {
      projectName: string;
      billNo: number;
      date: Date | null;
      amount: string | null;
      woNo: string | null;
      details: string | null;
      documentPath: string | null;
      certificatePath: string | null;
      testCopyPath: string | null;
    }[] = [];

    for (const wip of wips) {
      for (let n = 1; n <= 4; n++) {
        const date = wip[`raBill${n}Date` as keyof typeof wip] as Date | null;
        const amount = wip[`raBill${n}Amount` as keyof typeof wip] as { toString(): string } | null;
        const path = wip[`raBill${n}Path` as keyof typeof wip] as string | null;
        const woNo = wip[`raBill${n}WoNo` as keyof typeof wip] as string | null;
        const details = wip[`raBill${n}Details` as keyof typeof wip] as string | null;
        const cert = wip[`raBill${n}CertificatePath` as keyof typeof wip] as string | null;
        const testCopy = wip[`raBill${n}TestCopyPath` as keyof typeof wip] as string | null;
        // Only include slots that actually hold a bill.
        if (!date && !amount && !path && !cert && !testCopy && !woNo && !details) continue;
        rows.push({
          projectName: nameByProject.get(wip.projectId) ?? "Project",
          billNo: n,
          date,
          amount: amount?.toString() ?? null,
          woNo,
          details,
          documentPath: path,
          certificatePath: cert,
          testCopyPath: testCopy,
        });
      }
    }
    return rows.sort((a, b) => a.billNo - b.billNo);
  });
}

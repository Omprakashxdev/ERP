"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  tenderCreateSchema,
  tenderUpdateSchema,
  tenderFilterSchema,
  TenderCreateInput,
  TenderUpdateInput,
  TenderFilterInput,
} from "@/lib/schemas/tender";
import { buildTenderWhere } from "@/lib/queries/tender";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";
import { createTenderLinkedTasks, deleteLinkedTasks } from "./task-linking";

function toDecimal(value: Decimal | null | undefined): Decimal {
  return value ? new Decimal(value.toString()) : new Decimal("0.00");
}

function computeTenderTotals(row: {
  tenderFeeAmount: Decimal | null;
  emdAmount: Decimal | null;
  l1Amount: Decimal | null;
  l2Amount: Decimal | null;
  l3Amount: Decimal | null;
}) {
  const totalTenderFees = toDecimal(row.tenderFeeAmount).toDecimalPlaces(2);
  const totalEmd = toDecimal(row.emdAmount).toDecimalPlaces(2);

  const amounts = [
    row.l1Amount,
    row.l2Amount,
    row.l3Amount,
  ].filter((v): v is Decimal => v !== null);

  const lowestQuotedAmount =
    amounts.length > 0
      ? amounts.reduce((min, v) => (v.lessThan(min) ? new Decimal(v.toString()) : min), new Decimal(amounts[0].toString()))
      : null;

  return {
    totalTenderFees,
    totalEmd,
    lowestQuotedAmount,
  };
}

export async function createTender(
  input: TenderCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("tenders", "create", async (user) => {
    const parsed = tenderCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const tender = await prisma.tender.create({
      data: parsed as any,
    });

    await audit(user.id, "create", "Tender", tender.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    // Auto-create linked tasks for tender fee, EMD, bidding, opening dates
    await createTenderLinkedTasks({
      tenderId: tender.id,
      tenderName: parsed.name,
      tenderFeeDate: parsed.tenderFeeDate,
      emdDate: parsed.emdDate,
      emdReturnCollectionDate: parsed.emdReturnCollectionDate,
      biddingLastDate: parsed.biddingLastDate,
      dateOfOpening: parsed.dateOfOpening,
      preBidMeetingDate: parsed.preBidMeetingDate,
      negotiationMeetingDate: parsed.negotiationMeetingDate,
      concernAuthorityId: parsed.concernAuthorityId,
    }).catch(() => {});

    revalidatePath("/dashboard/tenders");
    revalidatePath("/dashboard/tasks");
    return { id: tender.id };
  });
}

export async function updateTender(
  input: TenderUpdateInput
): Promise<ActionResult<{ id: string; clientCreated?: string; projectCreated?: string }>> {
  return withPermission("tenders", "update", async (user) => {
    const parsed = tenderUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    // Check if status is being changed to WON
    const existing = await prisma.tender.findUnique({ where: { id } });
    const wasWon = existing?.status === "WON";
    const isNowWon = data.status === "WON";

    const tender = await prisma.tender.update({
      where: { id },
      data: data as any,
    });

    let clientCreated: string | undefined;
    let projectCreated: string | undefined;

    // Auto-create Client + Project when tender is won
    if (!wasWon && isNowWon) {
      // Find or create region based on tender's state
      let region = await prisma.region.findFirst({
        where: { name: { equals: tender.state ?? "Unknown", mode: "insensitive" } },
      });

      if (!region) {
        region = await prisma.region.create({
          data: {
            name: tender.state ?? "Unknown",
            abbreviation: (tender.state ?? "UNK").slice(0, 4).toUpperCase(),
          },
        });
      }

      // Find or create client based on tender's department
      let client = await prisma.client.findFirst({
        where: { name: { equals: tender.department ?? tender.name, mode: "insensitive" } },
      });

      if (!client) {
        client = await prisma.client.create({
          data: {
            name: tender.department ?? tender.name,
            abbreviation: (tender.department ?? tender.name).slice(0, 8).toUpperCase(),
          },
        });
        clientCreated = client.id;
      }

      // Create project from tender
      const projectName = tender.workName ?? tender.name;
      const existingProject = await prisma.project.findFirst({
        where: { clientId: client.id, name: projectName },
      });

      if (!existingProject) {
        const project = await prisma.project.create({
          data: {
            name: projectName,
            regionId: region.id,
            clientId: client.id,
            workOrderDate: tender.dateOfOpening ?? tender.tenderDate,
            timeLimitMonths: 12,
            estimatedCost: tender.l1Amount ?? new Decimal("0"),
            totalFee: tender.l1Amount ?? new Decimal("0"),
            workType: tender.workType ?? "OTHER",
            serviceType: tender.serviceType ?? "OTHER",
            status: "ACTIVE",
          },
        });
        projectCreated = project.id;

        // Create initial FundFlow record for the project
        await prisma.fundFlow.create({
          data: {
            projectId: project.id,
            miscExp: new Decimal("0"),
            staffExp: new Decimal("0"),
            totalProjectCost: tender.l1Amount ?? new Decimal("0"),
            completedWorkAmt: new Decimal("0"),
            proposedDueBillAmount: new Decimal("0"),
            feeReceived: new Decimal("0"),
          },
        });
      }
    }

    await audit(user.id, "update", "Tender", tender.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
      clientCreated,
      projectCreated,
    });

    // Auto-create linked tasks for any newly added dates
    await createTenderLinkedTasks({
      tenderId: tender.id,
      tenderName: tender.name,
      tenderFeeDate: parsed.tenderFeeDate,
      emdDate: parsed.emdDate,
      emdReturnCollectionDate: parsed.emdReturnCollectionDate,
      biddingLastDate: parsed.biddingLastDate,
      dateOfOpening: parsed.dateOfOpening,
      preBidMeetingDate: parsed.preBidMeetingDate,
      negotiationMeetingDate: parsed.negotiationMeetingDate,
      concernAuthorityId: parsed.concernAuthorityId,
    }).catch(() => {});

    revalidatePath("/dashboard/tenders");
    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard/projects");
    revalidatePath("/dashboard/clients");
    return { id: tender.id, clientCreated, projectCreated };
  });
}

export async function deleteTender(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("tenders", "delete", async (user) => {
    await checkRateLimit(user.id);

    const tender = await prisma.tender.delete({ where: { id } });

    await deleteLinkedTasks("TENDER", id).catch(() => {});

    await audit(user.id, "delete", "Tender", tender.id, {});

    revalidatePath("/dashboard/tenders");
    revalidatePath("/dashboard/tasks");
    return { id: tender.id };
  });
}

export async function getTenders(
  filter?: TenderFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("tenders", "read", async () => {
    const parsed = filter ? tenderFilterSchema.parse(filter) : undefined;
    const where = buildTenderWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.tender.findMany({
        where,
        orderBy: { tenderDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.tender.count({ where }),
    ]);

    const computedRows = rows.map((tender) => ({
      ...tender,
      ...computeTenderTotals(tender),
    }));

    return { rows: computedRows, total };
  });
}

export async function getTenderById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("tenders", "read", async () => {
    const tender = await prisma.tender.findUnique({
      where: { id },
    });

    if (!tender) return null;

    return { ...tender, ...computeTenderTotals(tender) };
  });
}

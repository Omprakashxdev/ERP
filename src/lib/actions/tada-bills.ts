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
  tadaClaimCreateSchema,
  tadaClaimUpdateSchema,
  tadaClaimFilterSchema,
  tadaApprovalSchema,
  TadaClaimCreateInput,
  TadaClaimUpdateInput,
  TadaClaimFilterInput,
  TadaApprovalInput,
} from "@/lib/schemas/tada-bills";
import { buildTadaClaimWhere } from "@/lib/queries/tada-bills";
import { TadaClaimStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

function computeTotal(data: TadaClaimCreateInput): Prisma.Decimal {
  const total = Number(data.travelExpense) + Number(data.accommodationExp) +
    Number(data.foodExpense) + Number(data.localConveyance) +
    Number(data.otherExpense);
  return new Prisma.Decimal(total.toFixed(2));
}

export async function createTadaClaim(
  input: TadaClaimCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("tadaBills", "create", async (user) => {
    const parsed = tadaClaimCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const totalClaimAmount = computeTotal(parsed);
    let balanceAmount: Prisma.Decimal | null = null;
    if (parsed.advanceAmount) {
      balanceAmount = new Prisma.Decimal(
        (Number(parsed.advanceAmount) - Number(totalClaimAmount)).toFixed(2)
      );
    }

    const staffRecord = await prisma.staff.findUnique({
      where: { id: parsed.staffId },
      select: { reportingManagerId: true, isActive: true },
    });

    if (!staffRecord?.isActive) {
      throw new Error("Cannot create claim for an inactive staff member");
    }

    const claim = await prisma.tadaClaim.create({
      data: {
        ...parsed,
        totalClaimAmount,
        adjustedAmount: parsed.advanceAmount ? new Prisma.Decimal("0.00") : null,
        balanceAmount,
        status: TadaClaimStatus.SUBMITTED,
      },
    });

    // Auto-route to reporting manager
    if (staffRecord?.reportingManagerId) {
      await prisma.forwardRecord.create({
        data: {
          entityType: "TADA_CLAIM",
          entityId: claim.id,
          toStaffId: staffRecord.reportingManagerId,
          fromUserId: user.id,
          remarks: "Auto-routed to reporting manager",
          status: "PENDING",
        },
      });
    }

    await audit(user.id, "create", "TadaClaim", claim.id, {
      staffId: parsed.staffId,
      totalClaimAmount: totalClaimAmount.toString(),
      autoRouted: true,
    });

    revalidatePath("/dashboard/tada-bills");
    return { id: claim.id };
  });
}

export async function updateTadaClaim(
  input: TadaClaimUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("tadaBills", "update", async (user) => {
    const parsed = tadaClaimUpdateSchema.parse(input);
    const { id, ...data } = parsed as { id: string } & Record<string, unknown>;
    await checkRateLimit(user.id);

    const existing = await prisma.tadaClaim.findUnique({ where: { id } });
    if (!existing) throw new Error("TADA claim not found");

    if (data.travelExpense || data.accommodationExp || data.foodExpense ||
        data.localConveyance || data.otherExpense) {
      const travel = data.travelExpense as Prisma.Decimal ?? existing.travelExpense;
      const accom = data.accommodationExp as Prisma.Decimal ?? existing.accommodationExp;
      const food = data.foodExpense as Prisma.Decimal ?? existing.foodExpense;
      const local = data.localConveyance as Prisma.Decimal ?? existing.localConveyance;
      const other = data.otherExpense as Prisma.Decimal ?? existing.otherExpense;
      data.totalClaimAmount = new Prisma.Decimal(
        (Number(travel) + Number(accom) + Number(food) +
          Number(local) + Number(other)).toFixed(2)
      );
    }

    // Returned claims (manager reject or accounts query) go back to the
    // queue when the employee corrects and saves them — matching the
    // workbook's "Return to Employee" loop.
    if (
      existing.status === "MANAGER_REJECTED" ||
      existing.status === "ACCOUNTS_QUERY"
    ) {
      data.status = "SUBMITTED";
    }

    const claim = await prisma.tadaClaim.update({
      where: { id },
      data: data as never,
    });

    await audit(user.id, "update", "TadaClaim", claim.id, {});

    revalidatePath("/dashboard/tada-bills");
    return { id: claim.id };
  });
}

export async function deleteTadaClaim(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("tadaBills", "delete", async (user) => {
    await prisma.tadaClaim.delete({ where: { id } });

    await audit(user.id, "delete", "TadaClaim", id, {});

    revalidatePath("/dashboard/tada-bills");
    return { id };
  });
}

export async function getTadaClaims(
  filter?: TadaClaimFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("tadaBills", "read", async () => {
    const parsed = filter ? tadaClaimFilterSchema.parse(filter) : undefined;
    const where = buildTadaClaimWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.tadaClaim.findMany({
        where,
        include: {
          staff: { select: { id: true, name: true, email: true, designation: true, employeeCode: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.tadaClaim.count({ where }),
    ]);

    return { rows, total };
  });
}

export async function getTadaClaimById(
  id: string
): Promise<ActionResult<unknown>> {
  return withPermission("tadaBills", "read", async () => {
    return prisma.tadaClaim.findUnique({
      where: { id },
      include: {
        staff: true,
      },
    });
  });
}

// Workbook flowchart: Employee -> Submit -> Manager review ->
// Accounts verification -> Payment approval -> Paid.
// Every action is allowed only from its required current status —
// a claim can never skip a stage (e.g. a SUBMITTED claim cannot be
// marked PAID).
const TADA_STAGE_GATE: Record<string, TadaClaimStatus> = {
  manager_approve: TadaClaimStatus.SUBMITTED,
  manager_reject: TadaClaimStatus.SUBMITTED,
  accounts_verify: TadaClaimStatus.MANAGER_APPROVED,
  accounts_query: TadaClaimStatus.MANAGER_APPROVED,
  finance_approve: TadaClaimStatus.ACCOUNTS_VERIFIED,
  mark_paid: TadaClaimStatus.FINANCE_APPROVED,
};

export async function processTadaApproval(
  input: TadaApprovalInput
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const { requireAuth } = await import("@/lib/authz");
    const user = await requireAuth();

    const parsed = tadaApprovalSchema.parse(input);
    const expectedStatus = TADA_STAGE_GATE[parsed.action];

    const existing = await prisma.tadaClaim.findUnique({
      where: { id: parsed.id },
      select: {
        status: true,
        staff: { select: { reportingManagerId: true } },
      },
    });
    if (!existing) return { success: false, error: "TADA claim not found" };

    const isManagerAction =
      parsed.action === "manager_approve" || parsed.action === "manager_reject";

    // Authorization — manager stage: reporting manager (via the staff
    // record's email bridge), MANAGERs or ADMINs. Accounts / finance /
    // payment stages stay ADMIN-only (no dedicated accounts role exists).
    let authorized = user.role === "ADMIN";
    if (!authorized && isManagerAction) {
      if (user.role === "MANAGER") {
        authorized = true;
      } else {
        const actingStaff = user.email
          ? await prisma.staff.findFirst({
              where: { email: { equals: user.email, mode: "insensitive" } },
              select: { id: true },
            })
          : null;
        authorized =
          !!actingStaff &&
          actingStaff.id === existing.staff.reportingManagerId;
      }
    }
    if (!authorized) {
      return {
        success: false,
        error:
          "You are not authorized to perform this approval stage " +
          "on this claim.",
      };
    }

    // Stage gate — status must match the action's required current state.
    if (existing.status !== expectedStatus) {
      return {
        success: false,
        error:
          `This claim is currently ${existing.status.replace(/_/g, " ")} ` +
          `and cannot be processed with this action. Claims must move ` +
          `through each approval stage in order.`,
      };
    }

    const now = new Date();
    let status: TadaClaimStatus = TadaClaimStatus.DRAFT;
    const data: Record<string, unknown> = {};

    switch (parsed.action) {
      case "manager_approve":
        status = TadaClaimStatus.MANAGER_APPROVED;
        data.managerRemarks = parsed.remarks;
        data.managerApprovedAt = now;
        data.managerApprovedById = user.id;
        break;
      case "manager_reject":
        status = TadaClaimStatus.MANAGER_REJECTED;
        data.rejectedReason = parsed.remarks;
        data.managerApprovedAt = now;
        data.managerApprovedById = user.id;
        break;
      case "accounts_verify":
        status = TadaClaimStatus.ACCOUNTS_VERIFIED;
        data.accountsRemarks = parsed.remarks;
        data.accountsVerifiedAt = now;
        data.accountsVerifiedById = user.id;
        break;
      case "accounts_query":
        status = TadaClaimStatus.ACCOUNTS_QUERY;
        data.accountsRemarks = parsed.remarks;
        data.accountsVerifiedAt = now;
        data.accountsVerifiedById = user.id;
        break;
      case "finance_approve":
        status = TadaClaimStatus.FINANCE_APPROVED;
        data.financeApprovedAt = now;
        data.financeApprovedById = user.id;
        break;
      case "mark_paid":
        status = TadaClaimStatus.PAID;
        data.paidAt = now;
        data.paymentMode = parsed.paymentMode;
        break;
    }

    const claim = await prisma.tadaClaim.update({
      where: { id: parsed.id },
      data: { status, ...data },
    });

    await audit(user.id, "approve", "TadaClaim", claim.id, {
      action: parsed.action,
      status,
    });

    revalidatePath("/dashboard/tada-bills");
    return { success: true, data: { id: claim.id, status: claim.status } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

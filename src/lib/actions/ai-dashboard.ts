"use server";

import { generateText } from "ai";
import { getGroqChatModel } from "@/lib/ai/groq";
import { withPermission, checkRateLimit, ActionResult } from "./wrapper";
import { requireAuth, hasPermission } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

async function checkAiAccess(role: string): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "ai_allowed_roles" },
  });
  if (!setting) return true;
  return setting.value.split(",").includes(role);
}

interface DashboardMetrics {
  projects: { total: number; active: number; byStatus: Record<string, number> };
  dueBills: {
    totalBilled: number;
    totalReceived: number;
    pendingCount: number;
    pendingAmount: number;
    overdueCount: number;
    largestPending: { projectName: string; amount: number; billDate: string }[];
  };
  tasks: {
    open: number;
    overdue: number;
    highPriority: number;
    byStatus: Record<string, number>;
  };
  tadaClaims: { pending: number; totalAmount: number };
  tenders: {
    active: number;
    upcomingDeadlines: { name: string; biddingLastDate: string | null }[];
  };
  fundFlow: {
    totalProjectCost: number;
    completedWorkAmt: number;
    feeReceived: number;
    topProjects: { name: string; cost: number; completed: number; received: number }[];
  };
  vehicles: { active: number; insuranceExpiring: number };
  paymentSchedules: {
    upcoming: { paymentType: string; amount: number; dueDate: string | null }[];
    overdue: number;
  };
  contractors: { total: number; missingDocs: number };
}

async function loadDashboardMetrics(): Promise<DashboardMetrics> {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    projectCount,
    activeProjects,
    projectStatusCounts,
    dueBillsPendingAgg,
    dueBillsTotalAgg,
    dueBillsReceivedAgg,
    overdueBillsCount,
    largestPendingBills,
    openTasks,
    overdueTasks,
    taskStatusCounts,
    highPriorityTasks,
    pendingTadaClaims,
    tadaTotalAmount,
    activeTenders,
    upcomingTenderDeadlines,
    fundFlows,
    activeVehicles,
    expiringInsuranceVehicles,
    upcomingPayments,
    overduePayments,
    contractorsCount,
    contractorsMissingDocs,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.project.groupBy({ by: ["status"], _count: true }),
    prisma.dueBill.aggregate({
      _sum: { billAmount: true, receivedAmount: true },
      where: { status: { in: ["PENDING", "PARTIAL"] } },
    }),
    prisma.dueBill.aggregate({ _sum: { billAmount: true } }),
    prisma.dueBill.aggregate({ _sum: { receivedAmount: true } }),
    prisma.dueBill.count({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        billDate: { lt: thirtyDaysAgo },
      },
    }),
    prisma.dueBill.findMany({
      where: { status: { in: ["PENDING", "PARTIAL"] } },
      include: { project: { select: { name: true } } },
      orderBy: { billAmount: "desc" },
      take: 5,
    }),
    prisma.task.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "ON_HOLD"] } } }),
    prisma.task.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "ON_HOLD"] },
        dueDate: { lt: now },
      },
    }),
    prisma.task.groupBy({ by: ["status"], _count: true }),
    prisma.task.count({ where: { priority: "HIGH", status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.tadaClaim.count({ where: { status: { in: ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "ACCOUNTS_VERIFIED", "FINANCE_APPROVED"] } } }),
    prisma.tadaClaim.aggregate({
      _sum: { totalClaimAmount: true },
      where: { status: { in: ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "ACCOUNTS_VERIFIED", "FINANCE_APPROVED"] } },
    }),
    prisma.tender.count({ where: { status: { in: ["UNDER_PREPARATION", "SUBMITTED", "UNDER_EVALUATION"] } } }),
    prisma.tender.findMany({
      where: {
        status: { in: ["UNDER_PREPARATION", "SUBMITTED", "UNDER_EVALUATION"] },
        biddingLastDate: { gte: now, lte: thirtyDaysFromNow },
      },
      select: { name: true, biddingLastDate: true },
      take: 5,
      orderBy: { biddingLastDate: "asc" },
    }),
    prisma.fundFlow.findMany({
      include: { project: { select: { name: true } } },
      take: 10,
    }),
    prisma.vehicle.count({ where: { status: "ACTIVE" } }),
    prisma.vehicle.count({
      where: {
        status: "ACTIVE",
        insuranceExpiryDate: { lte: thirtyDaysFromNow },
      },
    }),
    prisma.paymentSchedule.findMany({
      where: {
        status: { in: ["PENDING", "OVERDUE"] },
        dueDate: { gte: now, lte: thirtyDaysFromNow },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.paymentSchedule.count({
      where: {
        status: { in: ["PENDING", "OVERDUE"] },
        dueDate: { lt: now },
      },
    }),
    prisma.contractor.count(),
    prisma.contractor.count({
      where: {
        OR: [
          { workOrderCopyPath: null },
          { completionCertificatePath: null },
        ],
      },
    }),
  ]);

  const projectStatusMap: Record<string, number> = {};
  projectStatusCounts.forEach((s) => { projectStatusMap[s.status] = s._count; });

  const taskStatusMap: Record<string, number> = {};
  taskStatusCounts.forEach((s) => { taskStatusMap[s.status] = s._count; });

  return {
    projects: {
      total: projectCount,
      active: activeProjects,
      byStatus: projectStatusMap,
    },
    dueBills: {
      totalBilled: Number(dueBillsTotalAgg._sum.billAmount ?? 0),
      totalReceived: Number(dueBillsReceivedAgg._sum.receivedAmount ?? 0),
      pendingCount: await prisma.dueBill.count({ where: { status: { in: ["PENDING", "PARTIAL"] } } }),
      pendingAmount: Number(dueBillsPendingAgg._sum.billAmount ?? 0) - Number(dueBillsPendingAgg._sum.receivedAmount ?? 0),
      overdueCount: overdueBillsCount,
      largestPending: largestPendingBills.map((b) => ({
        projectName: b.project.name,
        amount: Number(b.billAmount) - Number(b.receivedAmount),
        billDate: b.billDate?.toISOString() ?? "",
      })),
    },
    tasks: {
      open: openTasks,
      overdue: overdueTasks,
      highPriority: highPriorityTasks,
      byStatus: taskStatusMap,
    },
    tadaClaims: {
      pending: pendingTadaClaims,
      totalAmount: Number(tadaTotalAmount._sum.totalClaimAmount ?? 0),
    },
    tenders: {
      active: activeTenders,
      upcomingDeadlines: upcomingTenderDeadlines.map((t) => ({
        name: t.name,
        biddingLastDate: t.biddingLastDate?.toISOString() ?? null,
      })),
    },
    fundFlow: {
      totalProjectCost: fundFlows.reduce((sum, f) => sum + Number(f.totalProjectCost), 0),
      completedWorkAmt: fundFlows.reduce((sum, f) => sum + Number(f.completedWorkAmt), 0),
      feeReceived: fundFlows.reduce((sum, f) => sum + Number(f.feeReceived), 0),
      topProjects: fundFlows.map((f) => ({
        name: f.project.name,
        cost: Number(f.totalProjectCost),
        completed: Number(f.completedWorkAmt),
        received: Number(f.feeReceived),
      })),
    },
    vehicles: {
      active: activeVehicles,
      insuranceExpiring: expiringInsuranceVehicles,
    },
    paymentSchedules: {
      upcoming: upcomingPayments.map((p) => ({
        paymentType: p.paymentType ?? p.category,
        amount: Number(p.amount),
        dueDate: p.dueDate?.toISOString() ?? null,
      })),
      overdue: overduePayments,
    },
    contractors: {
      total: contractorsCount,
      missingDocs: contractorsMissingDocs,
    },
  };
}

const dashboardSystemPrompt = `You are an AI executive assistant for an infrastructure consultancy ERP system.
You analyze a snapshot of key business metrics across ALL modules and produce a concise executive summary.

Your response MUST be structured as follows:

## Priority Actions
List 3-5 most urgent items that need immediate attention. Format each as:
- **[SEVERITY]**: **Description with key figures bolded**

## Financial Health
2-3 sentences on overall financial position. **Bold all monetary amounts, percentages, and counts.**

## Operational Risks
2-3 bullet points on operational risks. **Bold all numbers, counts, and deadlines.**

## Recommendations
2-3 actionable recommendations. **Bold the action verb and key metric in each.**

Rules:
- All monetary values are in Indian Rupees (INR). Format with commas (e.g., ₹12,34,567).
- Be concise and actionable. No fluff.
- If data is sparse or empty, acknowledge it and suggest what to prioritize.
- Do not make up data not present in the metrics.
- Use severity levels: CRITICAL, HIGH, MEDIUM, LOW.
- Focus on what a CEO/COO would care about: cash flow, deadlines, compliance, risks.
- ALWAYS bold important numbers, amounts, percentages, and severity labels using **double asterisks**.
- Format priority actions as: - **[CRITICAL]**: **₹29,50,000** pending for **GUDM Kutiyana** project`;

function buildDashboardPrompt(metrics: DashboardMetrics): string {
  return `Analyze the following ERP dashboard metrics and provide an executive summary.

Current date: ${new Date().toISOString()}

${JSON.stringify(metrics, null, 2)}`;
}

export async function generateDashboardSummary(): Promise<ActionResult<string>> {
  try {
    const user = await requireAuth();
    if (!hasPermission(user.role, "reports", "read")) {
      return { success: false, error: "You don't have permission to view reports." };
    }

    const hasAiAccess = await checkAiAccess(user.role);
    if (!hasAiAccess) {
      return { success: false, error: "AI assistant access is restricted. Contact your administrator." };
    }

    const metrics = await loadDashboardMetrics();
    const userPrompt = buildDashboardPrompt(metrics);

    const { text } = await generateText({
      model: getGroqChatModel(),
      system: dashboardSystemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
    });

    return { success: true, data: text };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[AI Dashboard] generateDashboardSummary failed:", message);
    return { success: false, error: message };
  }
}

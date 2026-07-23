"use server";

import { withPermission, ActionResult } from "./wrapper";
import { prisma } from "@/lib/prisma";

export interface SmartAlert {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: string;
  title: string;
  description: string;
  href: string;
  count?: number;
  amount?: number;
}

export async function getSmartAlerts(): Promise<ActionResult<SmartAlert[]>> {
  return withPermission("reports", "read", async () => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const alerts: SmartAlert[] = [];

    // 1. Overdue due bills (>30 days pending)
    const overdueBills = await prisma.dueBill.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        billDate: { lt: thirtyDaysAgo },
      },
      include: { project: { select: { name: true } } },
      orderBy: { billAmount: "desc" },
      take: 10,
    });

    if (overdueBills.length > 0) {
      const totalOverdue = overdueBills.reduce(
        (sum, b) => sum + Number(b.billAmount) - Number(b.receivedAmount),
        0
      );
      alerts.push({
        id: "overdue-bills",
        severity: overdueBills.length > 5 ? "CRITICAL" : "HIGH",
        category: "Due Bills",
        title: `${overdueBills.length} overdue bill${overdueBills.length > 1 ? "s" : ""} pending`,
        description: `Bills older than 30 days totaling ₹${totalOverdue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} are still pending collection.`,
        href: "/dashboard/due-bills",
        count: overdueBills.length,
        amount: totalOverdue,
      });
    }

    // 2. Overdue tasks
    const overdueTasks = await prisma.task.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "ON_HOLD"] },
        dueDate: { lt: now },
      },
    });

    if (overdueTasks > 0) {
      alerts.push({
        id: "overdue-tasks",
        severity: overdueTasks > 10 ? "HIGH" : "MEDIUM",
        category: "Tasks",
        title: `${overdueTasks} overdue task${overdueTasks > 1 ? "s" : ""}`,
        description: `Tasks past their due date that need immediate attention.`,
        href: "/dashboard/tasks",
        count: overdueTasks,
      });
    }

    // 3. High priority open tasks
    const highPriorityTasks = await prisma.task.count({
      where: { priority: "HIGH", status: { in: ["OPEN", "IN_PROGRESS"] } },
    });

    if (highPriorityTasks > 0) {
      alerts.push({
        id: "high-priority-tasks",
        severity: "MEDIUM",
        category: "Tasks",
        title: `${highPriorityTasks} high-priority task${highPriorityTasks > 1 ? "s" : ""} open`,
        description: `High-priority tasks that should be prioritized.`,
        href: "/dashboard/tasks",
        count: highPriorityTasks,
      });
    }

    // 4. Vehicle insurance expiring within 30 days
    const expiringInsurance = await prisma.vehicle.count({
      where: {
        status: "ACTIVE",
        insuranceExpiryDate: { lte: thirtyDaysFromNow, gte: now },
      },
    });

    if (expiringInsurance > 0) {
      alerts.push({
        id: "insurance-expiring",
        severity: "MEDIUM",
        category: "Vehicles",
        title: `${expiringInsurance} vehicle${expiringInsurance > 1 ? "s" : ""} with insurance expiring soon`,
        description: `Vehicle insurance policies expiring within 30 days. Renew to avoid compliance issues.`,
        href: "/dashboard/vehicle-log-book",
        count: expiringInsurance,
      });
    }

    // 5. Vehicle insurance already expired
    const expiredInsurance = await prisma.vehicle.count({
      where: {
        status: "ACTIVE",
        insuranceExpiryDate: { lt: now },
      },
    });

    if (expiredInsurance > 0) {
      alerts.push({
        id: "insurance-expired",
        severity: "CRITICAL",
        category: "Vehicles",
        title: `${expiredInsurance} vehicle${expiredInsurance > 1 ? "s" : ""} with expired insurance`,
        description: `Active vehicles with expired insurance. Immediate compliance risk.`,
        href: "/dashboard/vehicle-log-book",
        count: expiredInsurance,
      });
    }

    // 6. Pending TADA claims
    const pendingTada = await prisma.tadaClaim.count({
      where: { status: { in: ["SUBMITTED", "MANAGER_APPROVED", "ACCOUNTS_VERIFIED"] } },
    });

    if (pendingTada > 0) {
      alerts.push({
        id: "pending-tada",
        severity: pendingTada > 5 ? "HIGH" : "MEDIUM",
        category: "TADA Bills",
        title: `${pendingTada} TADA claim${pendingTada > 1 ? "s" : ""} pending approval`,
        description: `Travel expense claims awaiting processing in the approval pipeline.`,
        href: "/dashboard/tada-bills",
        count: pendingTada,
      });
    }

    // 7. Tender bidding deadlines within 7 days
    const upcomingTenders = await prisma.tender.findMany({
      where: {
        status: { in: ["UNDER_PREPARATION", "SUBMITTED"] },
        biddingLastDate: { gte: now, lte: sevenDaysFromNow },
      },
      select: { name: true, biddingLastDate: true },
      orderBy: { biddingLastDate: "asc" },
    });

    if (upcomingTenders.length > 0) {
      alerts.push({
        id: "tender-deadlines",
        severity: "HIGH",
        category: "Tenders",
        title: `${upcomingTenders.length} tender${upcomingTenders.length > 1 ? "s" : ""} with bidding deadline this week`,
        description: `Tender submissions closing within 7 days: ${upcomingTenders.map((t) => t.name).join(", ")}.`,
        href: "/dashboard/tenders",
        count: upcomingTenders.length,
      });
    }

    // 8. Overdue payment schedules
    const overduePayments = await prisma.paymentSchedule.count({
      where: {
        status: { in: ["PENDING", "OVERDUE"] },
        dueDate: { lt: now },
      },
    });

    if (overduePayments > 0) {
      alerts.push({
        id: "overdue-payments",
        severity: "HIGH",
        category: "Payment Schedules",
        title: `${overduePayments} overdue payment${overduePayments > 1 ? "s" : ""}`,
        description: `Scheduled payments past their due date. May incur penalties or late fees.`,
        href: "/dashboard/payment-schedules",
        count: overduePayments,
      });
    }

    // 9. Contractors missing work order docs
    const missingDocs = await prisma.contractor.count({
      where: {
        OR: [
          { workOrderCopyPath: null },
          { completionCertificatePath: null },
        ],
      },
    });

    if (missingDocs > 0) {
      alerts.push({
        id: "contractor-missing-docs",
        severity: "LOW",
        category: "Contractors",
        title: `${missingDocs} contractor${missingDocs > 1 ? "s" : ""} with missing documents`,
        description: `Contractors missing work order copies or completion certificates. Compliance gap.`,
        href: "/dashboard/contractors",
        count: missingDocs,
      });
    }

    // 10. Low bill realization rate
    const totalBilled = await prisma.dueBill.aggregate({ _sum: { billAmount: true } });
    const totalReceived = await prisma.dueBill.aggregate({ _sum: { receivedAmount: true } });
    const billedAmount = Number(totalBilled._sum.billAmount ?? 0);
    const receivedAmount = Number(totalReceived._sum.receivedAmount ?? 0);

    if (billedAmount > 0) {
      const realizationRate = (receivedAmount / billedAmount) * 100;
      if (realizationRate < 50) {
        alerts.push({
          id: "low-realization",
          severity: "HIGH",
          category: "Financial",
          title: `Bill realization rate at ${realizationRate.toFixed(1)}%`,
          description: `Only ₹${receivedAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })} received out of ₹${billedAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })} billed. Collection needs acceleration.`,
          href: "/dashboard/due-bills",
          amount: billedAmount - receivedAmount,
        });
      }
    }

    // Sort by severity
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return alerts;
  });
}

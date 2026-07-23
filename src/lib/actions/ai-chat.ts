"use server";

import { generateText } from "ai";
import { getGroqChatModel } from "@/lib/ai/groq";
import { requireAuth } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { ActionResult } from "./wrapper";

async function checkAiAccess(role: string): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "ai_allowed_roles" },
  });
  if (!setting) return true;
  const allowed = setting.value.split(",");
  return allowed.includes(role);
}

const aiDataModules = [
  "projects",
  "dueBills",
  "fundFlow",
  "tadaClaims",
  "tenders",
  "tasks",
  "vehicles",
  "paymentSchedules",
  "contractors",
] as const;

type AiDataModule = (typeof aiDataModules)[number];

async function getAiDataAccess(role: string): Promise<Set<AiDataModule>> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "ai_data_access" },
  });
  if (!setting) {
    return new Set(aiDataModules);
  }
  try {
    const matrix = JSON.parse(setting.value) as Record<string, AiDataModule[]>;
    const modules = matrix[role] ?? [];
    return new Set(modules);
  } catch {
    return new Set(aiDataModules);
  }
}

const chatSystemPrompt = `You are an AI assistant for SAEC ERP, an infrastructure consultancy enterprise resource planning system.
You serve TWO purposes:
1. Answer questions about the user's business data (projects, bills, tasks, etc.)
2. Act as a trained manual assistant — help users understand how to use any ERP feature, module, or workflow.

## ERP MODULES OVERVIEW

### Dashboard
- Financial Highlights: total projects, active projects, total fees, fee received
- Quick Access Tiles: clickable shortcuts to each module
- AI Executive Summary: AI-generated overview of critical metrics and risks
- Priority Actions: overdue payments, pending replies, urgent tasks

### Fund Flow (/dashboard/fund-flow)
Tracks project finances. Fields: project, miscExp, staffExp, totalProjectCost, completedWorkAmt, proposedDueBillAmount, feeReceived.
Filter by region, client, status. Supports bulk import and export.

### Due Bills (/dashboard/due-bills)
Tracks billing lifecycle. Fields: project, scheme, grossAmount, sgst, cgst, billAmount, chequeAmount, sd, itTds, receivedAmount, billDate, receiveDate, status.
Statuses: PENDING, PARTIAL, PAID, ON_HOLD, CANCELLED.
Filter by project, region, client, status, scheme.

### Work in Progress - WIP (/dashboard/wip)
Tracks active work orders. Fields: project, status, loiReceiptDate, agreementDate, workOrderDate, timeLimitMonths, stipulatedCompletionDate, targetCompletionDate, hoCoordinator, roCoordinator, securityDepositAmount, amountOfWorkDone, finalProgressAmount, completionDate.
Supports up to 4 RA bills. Tracks security deposits and coordinators.

### Contractors (/dashboard/contractors)
Vendor management. Fields: name, contactPerson, phone, email, address, contractAmount, agreementDate, workOrderDate, workName, workType, serviceType, scheduleBAmount, finalProgressAmount.
Work types: Building, Road, UGD, Water Supply, etc.

### Tenders (/dashboard/tenders)
Bid tracking. Fields: name, tenderId, department, state, city, platform, workName, workType, serviceType, tenderDate, preBidMeetingDate, biddingLastDate, dateOfOpening, tenderFeeAmount, emdAmount, l1ContractorName, l1Amount, status.
Statuses: UNDER_PREPARATION, SUBMITTED, UNDER_EVALUATION, WON, LOST, WITHDRAWN, CANCELLED.

### Payment Schedules (/dashboard/payment-schedules)
Upcoming payments tracker. Fields: date, dueDate, paymentType, category, detail, amount, status, remarks.
Categories: EXCISE, GST, TDS, VEHICLE_LOAN.
Statuses: PENDING, PAID, OVERDUE, CANCELLED.

### Vehicle Log Book (/dashboard/vehicle-log-book)
Two tabs: Vehicles and Journey Logs.
Vehicle fields: registrationNumber, make, model, year, status, rcNumber, rcExpiryDate, insurancePolicyNumber, insuranceExpiryDate, pucExpiryDate.
Journey log fields: vehicle, journeyDate, fromLocation, toLocation, startKm, endKm, totalKm, fuelExpense, otherExpense, approvalStatus.
Approval statuses: PENDING, APPROVED, REJECTED.

### Assets (/dashboard/assets)
Equipment tracking. Fields: itemCode, name, category, make, model, yearOfPurchase, quantity, securityCode, assigneeType, assignee, assignedQuantity, responsiblePerson, status.
Statuses: AVAILABLE, ASSIGNED, UNDER_MAINTENANCE, DISPOSED.

### In-Out Register (/dashboard/in-out-register)
Document tracking. Fields: documentDate, receivedDate, documentRefNo, details, client, actionSuggestedStaff, ccStaff, replyDate, replyRefNo.
Links to clients and staff. Tracks replies and CC assignments.

### TADA Bills (/dashboard/tada-bills)
Travel & daily allowance claims. Fields: staff, tourPurpose, fromDate, toDate, location, travelExpense, accommodationExp, foodExpense, localConveyance, otherExpense, totalClaimAmount, advanceAmount, status.
Approval workflow: DRAFT → SUBMITTED → MANAGER_APPROVED → ACCOUNTS_VERIFIED → FINANCE_APPROVED → PAID.
Can also be REJECTED at any stage.

### Tasks (/dashboard/tasks)
Task management. Fields: title, description, status, priority, assignedTo, project, dueDate.
Statuses: OPEN, IN_PROGRESS, PENDING_REVIEW, COMPLETED, ON_HOLD, CANCELLED.
Priorities: CRITICAL, HIGH, MEDIUM, LOW.
Tracks rework count and overdue tasks.

### Reports (/dashboard/reports)
Analytics across all modules. Export in CSV, JSON, XLSX formats.

### Settings (/dashboard/settings)
Tabs: Export/Import, Notifications, Audit Log, Users, Rights (role-dependent access).
- Export/Import: Export or import data across modules in CSV/JSON/XLSX
- Notifications: Configure alert rules and thresholds
- Audit Log: View system activity logs (Admin, Auditor only)
- Users: Create/manage user accounts (Admin only)
- Rights: Configure role permissions and AI data access

## BULK IMPORT
Every module has a "Bulk Import" button. Users can download a CSV or Excel template, fill in data, and upload.
Relation fields (project, staff, client) accept names instead of IDs — the system resolves them automatically.
Supported formats: CSV, XLSX (Excel).

## USER ROLES
- Admin: Full access to everything including user management and audit logs
- Manager: Most modules, export/import, notifications, user rights (no audit log, no user management)
- Staff: Operational modules, notifications, user rights (no export/import, no audit log)
- Auditor: Read-only, export/import, audit logs, notifications

## AI FEATURES
- AI Executive Summary: On dashboard, generates risk assessment with CRITICAL/HIGH/MEDIUM/LOW severity badges
- AI Chat Assistant: Floating button bottom-right, answers questions about data and how to use the ERP

## RULES
- All monetary values are in Indian Rupees (INR). Format with commas (e.g., ₹12,34,567).
- Be concise and direct. Use bullet points where appropriate.
- If data is sparse or empty, acknowledge it and suggest what to prioritize.
- Do not make up data not present in the metrics.
- When asked about how to use a feature, provide step-by-step guidance based on the module information above.
- Use markdown formatting (## headers, **bold**, - bullet points).
- Keep responses short — this is a chat interface, not a report.`;

async function loadContextMetrics(allowed: Set<AiDataModule>): Promise<string> {
  const metrics: Record<string, unknown> = {};
  const tasks: Promise<void>[] = [];

  if (allowed.has("projects")) {
    tasks.push(
      (async () => {
        const [total, active] = await Promise.all([
          prisma.project.count(),
          prisma.project.count({ where: { status: "ACTIVE" } }),
        ]);
        metrics.projects = { total, active };
      })()
    );
  }

  if (allowed.has("dueBills")) {
    tasks.push(
      (async () => {
        const [pending, totalBilled, totalReceived] = await Promise.all([
          prisma.dueBill.aggregate({
            _sum: { billAmount: true, receivedAmount: true },
            where: { status: { in: ["PENDING", "PARTIAL"] } },
          }),
          prisma.dueBill.aggregate({ _sum: { billAmount: true } }),
          prisma.dueBill.aggregate({ _sum: { receivedAmount: true } }),
        ]);
        metrics.dueBills = {
          totalBilled: Number(totalBilled._sum.billAmount ?? 0),
          totalReceived: Number(totalReceived._sum.receivedAmount ?? 0),
          pendingAmount: Number(pending._sum.billAmount ?? 0) - Number(pending._sum.receivedAmount ?? 0),
        };
      })()
    );
  }

  if (allowed.has("fundFlow")) {
    tasks.push(
      (async () => {
        const fundFlows = await prisma.fundFlow.findMany({
          include: { project: { select: { name: true } } },
          take: 10,
        });
        metrics.fundFlow = fundFlows.map((f) => ({
          project: f.project.name,
          cost: Number(f.totalProjectCost),
          completed: Number(f.completedWorkAmt),
          received: Number(f.feeReceived),
        }));
      })()
    );
  }

  if (allowed.has("tadaClaims")) {
    tasks.push(
      (async () => {
        const pending = await prisma.tadaClaim.count({
          where: { status: { in: ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "ACCOUNTS_VERIFIED", "FINANCE_APPROVED"] } },
        });
        metrics.tadaClaims = { pending };
      })()
    );
  }

  if (allowed.has("tenders")) {
    tasks.push(
      (async () => {
        const active = await prisma.tender.count({
          where: { status: { in: ["UNDER_PREPARATION", "SUBMITTED", "UNDER_EVALUATION"] } },
        });
        metrics.tenders = { active };
      })()
    );
  }

  if (allowed.has("tasks")) {
    tasks.push(
      (async () => {
        const [open, overdue] = await Promise.all([
          prisma.task.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "ON_HOLD"] } } }),
          prisma.task.count({
            where: {
              status: { in: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "ON_HOLD"] },
              dueDate: { lt: new Date() },
            },
          }),
        ]);
        metrics.tasks = { open, overdue };
      })()
    );
  }

  if (allowed.has("vehicles")) {
    tasks.push(
      (async () => {
        const active = await prisma.vehicle.count({ where: { status: "ACTIVE" } });
        metrics.vehicles = { active };
      })()
    );
  }

  if (allowed.has("paymentSchedules")) {
    tasks.push(
      (async () => {
        const overdue = await prisma.paymentSchedule.count({
          where: { status: { in: ["PENDING", "OVERDUE"] }, dueDate: { lt: new Date() } },
        });
        metrics.overduePayments = overdue;
      })()
    );
  }

  if (allowed.has("contractors")) {
    tasks.push(
      (async () => {
        const total = await prisma.contractor.count();
        metrics.contractors = { total };
      })()
    );
  }

  await Promise.all(tasks);
  return JSON.stringify(metrics, null, 2);
}

export async function sendAiChatMessage(
  message: string
): Promise<ActionResult<string>> {
  try {
    const user = await requireAuth();

    const hasAccess = await checkAiAccess(user.role);
    if (!hasAccess) {
      return { success: false, error: "AI assistant access is restricted. Contact your administrator." };
    }

    const allowedModules = await getAiDataAccess(user.role);
    const context = await loadContextMetrics(allowedModules);

    const moduleList = Array.from(allowedModules).join(", ");
    const dynamicPrompt = chatSystemPrompt + `\n\nIMPORTANT: You only have access to these data modules: ${moduleList}. If the user asks about data outside these modules, tell them you don't have access to that information and suggest they contact an administrator.`;

    const { text } = await generateText({
      model: getGroqChatModel(),
      system: dynamicPrompt,
      prompt: `Current ERP data snapshot:\n${context}\n\nUser question: ${message}`,
      temperature: 0.3,
    });

    return { success: true, data: text };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[AI Chat] sendAiChatMessage failed:", message);
    return { success: false, error: message };
  }
}

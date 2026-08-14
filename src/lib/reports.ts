import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type ReportCategory =
  | "in-out-register"
  | "vehicle-log-book"
  | "assets"
  | "due-bills"
  | "fund-flow"
  | "tenders"
  | "payment-schedules"
  | "wip"
  | "tada-bills"
  | "tasks";

export interface ReportDefinition {
  id: string;
  category: ReportCategory;
  title: string;
  description: string;
  groupBy?: string[];
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  // In-Out Register
  {
    id: "inout-general",
    category: "in-out-register",
    title: "General Inward-Outward Register",
    description: "Client wise, date wise, age wise (15/20/25 days due), staff member wise",
    groupBy: ["client", "date", "age", "staff"],
  },
  {
    id: "inout-pending-reply",
    category: "in-out-register",
    title: "Pending for Reply",
    description: "Client wise, date wise, age wise, staff member + department wise",
    groupBy: ["client", "date", "age", "staff", "department"],
  },

  // Vehicle Log Book
  {
    id: "vehicle-km",
    category: "vehicle-log-book",
    title: "Vehicle Travelling KM Report",
    description: "Date wise, month wise, purpose wise (GPH, Morbi Nagarpalika)",
    groupBy: ["date", "month", "purpose"],
  },
  {
    id: "vehicle-travelling",
    category: "vehicle-log-book",
    title: "Vehicle Travelling Report",
    description: "Person wise, KM wise, city wise",
    groupBy: ["person", "km", "city"],
  },
  {
    id: "vehicle-expense",
    category: "vehicle-log-book",
    title: "Vehicle Expense Report",
    description: "Fuel, maintenance, tax, insurance, PUC, service expense wise",
    groupBy: ["fuel", "maintenance", "tax", "insurance", "puc", "service"],
  },
  {
    id: "vehicle-reminder",
    category: "vehicle-log-book",
    title: "Vehicle Reminder Report",
    description: "Tax renewal, insurance renewal, PUC renewal reminders",
    groupBy: ["tax", "insurance", "puc"],
  },

  // Assets
  {
    id: "asset-category",
    category: "assets",
    title: "Property List – Category Wise",
    description: "Furniture, electronics, computer, consumable products + service reminders",
    groupBy: ["category"],
  },
  {
    id: "asset-age",
    category: "assets",
    title: "Property List – Age Wise",
    description: "Age of assets by category (e.g. furniture 1yr 4mo, electronics 2yr 3mo)",
    groupBy: ["age"],
  },
  {
    id: "asset-office",
    category: "assets",
    title: "Property List – Office Wise",
    description: "Office-wise breakdown by category (e.g. Madhapar > furniture 5, electronics 6)",
    groupBy: ["office"],
  },
  {
    id: "asset-warranty",
    category: "assets",
    title: "Property List – Warranty Wise",
    description: "Warranty remaining by category (e.g. electronics 3/6 months, computer 2/1 year)",
    groupBy: ["warranty"],
  },
  {
    id: "asset-assignee",
    category: "assets",
    title: "Property List – Assign to Person",
    description: "Person-wise asset assignment (e.g. N D Sata > furniture 1, electronics 2, computer 1)",
    groupBy: ["assignee"],
  },

  // Due Bills
  {
    id: "duebills-summary",
    category: "due-bills",
    title: "Due Bills Summary Report",
    description: "Client wise, project wise, division wise, region wise",
    groupBy: ["client", "project", "division", "region"],
  },
  {
    id: "duebills-outstanding",
    category: "due-bills",
    title: "Outstanding Bills Report",
    description: "Aging wise: 0-30 days, 31-60 days, 61-90 days, above 90 days",
    groupBy: ["aging"],
  },
  {
    id: "duebills-submission",
    category: "due-bills",
    title: "Bill Submission Report",
    description: "Date wise, month wise, client wise, project wise",
    groupBy: ["date", "month", "client", "project"],
  },
  {
    id: "duebills-collection",
    category: "due-bills",
    title: "Bill Collection Report",
    description: "Received amount, pending amount, collection date wise",
    groupBy: ["date"],
  },
  {
    id: "duebills-client-outstanding",
    category: "due-bills",
    title: "Client Outstanding Report",
    description: "Client wise pending receivable amount",
    groupBy: ["client"],
  },
  {
    id: "duebills-project-outstanding",
    category: "due-bills",
    title: "Project Outstanding Report",
    description: "Project wise pending receivable amount",
    groupBy: ["project"],
  },
  {
    id: "duebills-division",
    category: "due-bills",
    title: "Division Wise Due Report",
    description: "Rajkot, Ahmedabad, Surat, Vadodara division wise",
    groupBy: ["division"],
  },

  // Fund Flow
  {
    id: "fundflow-summary",
    category: "fund-flow",
    title: "Fund Flow Summary Report",
    description: "Month wise, quarter wise, year wise",
    groupBy: ["month", "quarter", "year"],
  },
  {
    id: "fundflow-region",
    category: "fund-flow",
    title: "Region Wise Fund Flow Report",
    description: "Region wise fund flow breakdown",
    groupBy: ["region"],
  },
  {
    id: "fundflow-project",
    category: "fund-flow",
    title: "Project Wise Fund Flow Report",
    description: "Project wise fund flow breakdown",
    groupBy: ["project"],
  },
  {
    id: "fundflow-department-expense",
    category: "fund-flow",
    title: "Department Wise Expense Report",
    description: "Department wise expense breakdown",
    groupBy: ["department"],
  },
  {
    id: "fundflow-monthly-cashflow",
    category: "fund-flow",
    title: "Monthly Cash Flow Report",
    description: "Monthly cash flow statement",
    groupBy: ["month"],
  },
  {
    id: "fundflow-quarterly-cashflow",
    category: "fund-flow",
    title: "Quarterly Cash Flow Report",
    description: "Quarterly cash flow statement",
    groupBy: ["quarter"],
  },
  {
    id: "fundflow-annual",
    category: "fund-flow",
    title: "Annual Cash Flow Report",
    description: "Annual cash flow statement",
    groupBy: ["year"],
  },
  {
    id: "fundflow-forecast",
    category: "fund-flow",
    title: "Forecast Fund Flow Report",
    description: "Next month, next quarter, next financial year forecast",
    groupBy: ["forecast"],
  },

  // Tenders
  {
    id: "tender-applied",
    category: "tenders",
    title: "Tender Applied Report",
    description: "Date wise, month wise, city wise, state wise, platform wise, service type wise",
    groupBy: ["date", "month", "city", "state", "platform", "serviceType"],
  },
  {
    id: "tender-fee-emd",
    category: "tenders",
    title: "Tender Fee – EMD Wise Report",
    description: "EMD deposits, refund status (refunded/pending), draft/bank instrument details",
    groupBy: ["date", "month", "client"],
  },
  {
    id: "tender-status",
    category: "tenders",
    title: "Tender Status Report",
    description: "Open, close, assigned, not assigned, with reason",
    groupBy: ["status"],
  },

  // Payment Schedules
  {
    id: "pmt-by-type",
    category: "payment-schedules",
    title: "Payment by Type Report",
    description: "Scheduled date, tenure, due payment",
    groupBy: ["paymentType"],
  },
  {
    id: "pmt-by-category",
    category: "payment-schedules",
    title: "Payment by Category Report",
    description: "GST, TDS, Vehicle Loan category wise",
    groupBy: ["category"],
  },
  {
    id: "pmt-by-amount",
    category: "payment-schedules",
    title: "Payment by Amount Report",
    description: "Amount wise breakdown by GST, TDS, Vehicle Loan",
    groupBy: ["amount"],
  },

  // WIP
  {
    id: "wip-work-order",
    category: "wip",
    title: "Work Order Report",
    description: "Date wise, amount wise, security deposit wise, status",
    groupBy: ["date", "amount", "securityDeposit", "status"],
  },
  {
    id: "wip-staff-allocation",
    category: "wip",
    title: "Staff Allocation Report",
    description: "Date wise, staff wise, post wise — dynamic",
    groupBy: ["date", "staff", "post"],
  },
  {
    id: "wip-ra-bill",
    category: "wip",
    title: "RA Bill Report",
    description: "Date, work order, customer, amount wise — agency + Savjani",
    groupBy: ["date", "workOrder", "customer", "amount"],
  },
  {
    id: "wip-final-progress",
    category: "wip",
    title: "Final Progress Report",
    description: "Work order - RA bill 1 - RA bill 2 - RA bill 3 = balance",
    groupBy: ["progress"],
  },

  // TADA Bills
  {
    id: "tada-claim",
    category: "tada-bills",
    title: "TADA Claim Report",
    description: "Date wise, month wise, employee wise, department wise, project wise",
    groupBy: ["date", "month", "employee", "department", "project"],
  },
  {
    id: "tada-expense",
    category: "tada-bills",
    title: "TADA Expense Report",
    description: "Travel, lodging, food, local conveyance, miscellaneous expense wise",
    groupBy: ["travel", "lodging", "food", "localConveyance", "miscellaneous"],
  },
  {
    id: "tada-pending-approval",
    category: "tada-bills",
    title: "Pending Approval Report",
    description: "Manager approval pending, accounts verification pending, finance approval pending",
    groupBy: ["approvalStage"],
  },
  {
    id: "tada-rejected",
    category: "tada-bills",
    title: "Rejected Claims Report",
    description: "Employee wise, department wise, reason wise",
    groupBy: ["employee", "department", "reason"],
  },
  {
    id: "tada-approved",
    category: "tada-bills",
    title: "Approved Claims Report",
    description: "Date wise, employee wise, project wise, amount wise",
    groupBy: ["date", "employee", "project", "amount"],
  },
  {
    id: "tada-advance-adjustment",
    category: "tada-bills",
    title: "Advance Adjustment Report",
    description: "Advance given, adjusted amount, balance recovery amount",
    groupBy: ["advance", "adjusted", "balance"],
  },
  {
    id: "tada-payment",
    category: "tada-bills",
    title: "Payment Report",
    description: "Payment date wise, employee wise, project wise, amount wise",
    groupBy: ["paymentDate", "employee", "project", "amount"],
  },
  {
    id: "tada-travel-summary",
    category: "tada-bills",
    title: "Travel Summary Report",
    description: "City wise, project wise, client wise, purpose wise",
    groupBy: ["city", "project", "client", "purpose"],
  },
  {
    id: "tada-budget-vs-actual",
    category: "tada-bills",
    title: "Budget vs Actual TADA Report",
    description: "Department wise, project wise, month wise",
    groupBy: ["department", "project", "month"],
  },
  {
    id: "tada-employee-ledger",
    category: "tada-bills",
    title: "Employee TADA Ledger Report",
    description: "Opening balance, claim amount, approved amount, paid amount",
    groupBy: ["employee"],
  },
  {
    id: "tada-overdue-claim",
    category: "tada-bills",
    title: "Overdue Claim Submission Report",
    description: "Tour completed but claim not submitted within prescribed period",
    groupBy: ["overdue"],
  },

  // Tasks
  {
    id: "task-status",
    category: "tasks",
    title: "Task Status Report",
    description: "Open, in progress, on hold, pending review, completed, cancelled",
    groupBy: ["status"],
  },
  {
    id: "task-employee",
    category: "tasks",
    title: "Employee Task Report",
    description: "Employee wise assigned, completed, pending, overdue tasks",
    groupBy: ["employee"],
  },
  {
    id: "task-department",
    category: "tasks",
    title: "Department Task Report",
    description: "Department wise task allocation and completion",
    groupBy: ["department"],
  },
  {
    id: "task-priority",
    category: "tasks",
    title: "Task Priority Report",
    description: "Low, medium, high, critical priority wise",
    groupBy: ["priority"],
  },
  {
    id: "task-completion",
    category: "tasks",
    title: "Task Completion Report",
    description: "Date wise, month wise, employee wise",
    groupBy: ["date", "month", "employee"],
  },
  {
    id: "task-overdue",
    category: "tasks",
    title: "Overdue Task Report",
    description: "Employee wise, department wise, project wise",
    groupBy: ["employee", "department", "project"],
  },
  {
    id: "task-aging",
    category: "tasks",
    title: "Task Aging Report",
    description: "0-7 days, 8-15 days, 16-30 days, above 30 days pending",
    groupBy: ["aging"],
  },
  {
    id: "task-assignment",
    category: "tasks",
    title: "Task Assignment Report",
    description: "Assigned by wise, assigned to wise",
    groupBy: ["assignedBy", "assignedTo"],
  },
  {
    id: "task-project-wise",
    category: "tasks",
    title: "Project Wise Task Report",
    description: "Project wise open, completed, pending tasks",
    groupBy: ["project"],
  },
  {
    id: "task-rework",
    category: "tasks",
    title: "Task Rework Report",
    description: "Returned for correction, employee wise, department wise",
    groupBy: ["employee", "department"],
  },
  {
    id: "task-wise-employee",
    category: "tasks",
    title: "Task-wise Employee Summary",
    description: "Task wise summary with employee allocation, status and due date",
    groupBy: ["task", "employee"],
  },
];

export const REPORT_CATEGORIES: { id: ReportCategory; label: string; icon: string }[] = [
  { id: "in-out-register", label: "In-Out Register", icon: "ArrowLeftRight" },
  { id: "vehicle-log-book", label: "Vehicle Log Book", icon: "Car" },
  { id: "assets", label: "Assets", icon: "Box" },
  { id: "due-bills", label: "Due Bills", icon: "FileText" },
  { id: "fund-flow", label: "Fund Flow", icon: "Landmark" },
  { id: "tenders", label: "Tenders", icon: "ClipboardList" },
  { id: "payment-schedules", label: "Payment Schedules", icon: "CalendarDays" },
  { id: "wip", label: "WIP", icon: "Hammer" },
  { id: "tada-bills", label: "TADA Bills", icon: "ReceiptText" },
  { id: "tasks", label: "Tasks", icon: "CheckSquare" },
];

export async function runReport(
  reportId: string,
  params?: { dateFrom?: Date; dateTo?: Date; groupBy?: string }
): Promise<{ columns: string[]; rows: Record<string, unknown>[]; summary?: Record<string, number> }> {
  switch (reportId) {
    case "inout-general":
      return runInOutGeneral(params);
    case "inout-pending-reply":
      return runInOutPendingReply(params);
    case "vehicle-km":
      return runVehicleKm(params);
    case "vehicle-expense":
      return runVehicleExpense(params);
    case "vehicle-reminder":
      return runVehicleReminder(params);
    case "asset-category":
      return runAssetCategory(params);
    case "asset-warranty":
      return runAssetWarranty(params);
    case "duebills-summary":
      return runDueBillsSummary(params);
    case "duebills-outstanding":
      return runDueBillsOutstanding(params);
    case "duebills-client-outstanding":
      return runDueBillsClientOutstanding(params);
    case "fundflow-summary":
      return runFundFlowSummary(params);
    case "tender-applied":
      return runTenderApplied(params);
    case "tender-status":
      return runTenderStatus(params);
    case "pmt-by-type":
      return runPmtByType(params);
    case "pmt-by-category":
      return runPmtByCategory(params);
    case "tada-claim":
      return runTadaClaim(params);
    case "tada-pending-approval":
      return runTadaPendingApproval(params);
    case "task-status":
      return runTaskStatus(params);
    case "task-overdue":
      return runTaskOverdue(params);
    case "task-aging":
      return runTaskAging(params);
    case "vehicle-travelling":
      return runVehicleTravelling(params);
    case "asset-age":
      return runAssetAge(params);
    case "asset-office":
      return runAssetOffice(params);
    case "asset-assignee":
      return runAssetAssignee(params);
    case "duebills-submission":
      return runDueBillsSubmission(params);
    case "duebills-collection":
      return runDueBillsCollection(params);
    case "duebills-project-outstanding":
      return runDueBillsProjectOutstanding(params);
    case "duebills-division":
      return runDueBillsDivision(params);
    case "fundflow-region":
      return runFundFlowRegion(params);
    case "fundflow-project":
      return runFundFlowProject(params);
    case "fundflow-department-expense":
      return runFundFlowDeptExpense(params);
    case "fundflow-monthly-cashflow":
      return runFundFlowMonthlyCashflow(params);
    case "fundflow-quarterly-cashflow":
      return runFundFlowQuarterlyCashflow(params);
    case "fundflow-annual":
      return runFundFlowAnnual(params);
    case "fundflow-forecast":
      return runFundFlowForecast(params);
    case "tender-fee-emd":
      return runTenderFeeEmd(params);
    case "pmt-by-amount":
      return runPmtByAmount(params);
    case "wip-work-order":
      return runWipWorkOrder(params);
    case "wip-staff-allocation":
      return runWipStaffAllocation(params);
    case "wip-ra-bill":
      return runWipRaBill(params);
    case "wip-final-progress":
      return runWipFinalProgress(params);
    case "tada-expense":
      return runTadaExpense(params);
    case "tada-rejected":
      return runTadaRejected(params);
    case "tada-approved":
      return runTadaApproved(params);
    case "tada-advance-adjustment":
      return runTadaAdvanceAdjustment(params);
    case "tada-payment":
      return runTadaPayment(params);
    case "tada-travel-summary":
      return runTadaTravelSummary(params);
    case "tada-budget-vs-actual":
      return runTadaBudgetVsActual(params);
    case "tada-employee-ledger":
      return runTadaEmployeeLedger(params);
    case "tada-overdue-claim":
      return runTadaOverdueClaim(params);
    case "task-employee":
      return runTaskEmployee(params);
    case "task-department":
      return runTaskDepartment(params);
    case "task-priority":
      return runTaskPriority(params);
    case "task-completion":
      return runTaskCompletion(params);
    case "task-assignment":
      return runTaskAssignment(params);
    case "task-project-wise":
      return runTaskProjectWise(params);
    case "task-rework":
      return runTaskRework(params);
    case "task-wise-employee":
      return runTaskWiseEmployee(params);
    default:
      return { columns: [], rows: [] };
  }
}

// --- Report implementations ---

function dateFilter(params?: { dateFrom?: Date; dateTo?: Date }): Record<string, { gte?: Date; lt?: Date }> {
  const filter: Record<string, { gte?: Date; lt?: Date }> = {};
  if (params?.dateFrom || params?.dateTo) {
    filter.createdAt = {};
    if (params?.dateFrom) filter.createdAt.gte = params.dateFrom;
    if (params?.dateTo) {
      const to = new Date(params.dateTo);
      to.setDate(to.getDate() + 1);
      filter.createdAt.lt = to;
    }
  }
  return filter;
}

async function runInOutGeneral(params?: { dateFrom?: Date; dateTo?: Date }) {
  const where = dateFilter(params);
  const rows = await prisma.inOutRegister.findMany({
    where,
    include: {
      client: { select: { name: true } },
      actionSuggestedStaff: { select: { name: true } },
    },
    orderBy: { receivedDate: "desc" },
    take: 500,
  });

  return {
    columns: ["Direction", "Doc Date", "Received/Sent Date", "Doc Ref No", "Client", "Details", "Action Staff", "Reply Date", "Reply Ref No", "Age (days)"],
    rows: rows.map((r) => ({
      Direction: r.direction === "OUTWARD" ? "Outward" : "Inward",
      "Doc Date": r.documentDate,
      "Received/Sent Date": r.receivedDate,
      "Doc Ref No": r.documentRefNo,
      Client: r.client.name,
      Details: r.details ?? "",
      "Action Staff": r.actionSuggestedStaff?.name ?? "—",
      "Reply Date": r.replyDate ?? "—",
      "Reply Ref No": r.replyRefNo ?? "—",
      "Age (days)": Math.floor((Date.now() - new Date(r.receivedDate).getTime()) / 86400000),
    })),
  };
}

async function runInOutPendingReply(params?: { dateFrom?: Date; dateTo?: Date }) {
  const where = { ...dateFilter(params), replyDate: null, direction: "INWARD" as const };
  const rows = await prisma.inOutRegister.findMany({
    where,
    include: {
      client: { select: { name: true } },
      actionSuggestedStaff: { select: { name: true } },
    },
    orderBy: { receivedDate: "asc" },
    take: 500,
  });

  return {
    columns: ["Received Date", "Doc Ref No", "Client", "Details", "Action Staff", "Age (days)"],
    rows: rows.map((r) => ({
      "Received Date": r.receivedDate,
      "Doc Ref No": r.documentRefNo,
      Client: r.client.name,
      Details: r.details ?? "",
      "Action Staff": r.actionSuggestedStaff?.name ?? "—",
      "Age (days)": Math.floor((Date.now() - new Date(r.receivedDate).getTime()) / 86400000),
    })),
    summary: { "Total pending": rows.length },
  };
}

async function runVehicleKm(params?: { dateFrom?: Date; dateTo?: Date }) {
  const where = dateFilter(params);
  const logs = await prisma.journeyLog.findMany({
    where,
    include: { vehicle: { select: { registrationNumber: true, make: true } } },
    orderBy: { journeyDate: "desc" },
    take: 500,
  });

  return {
    columns: ["Date", "Vehicle", "From", "To", "KM", "Purpose", "Driver"],
    rows: logs.map((l) => ({
      Date: l.journeyDate,
      Vehicle: l.vehicle.registrationNumber,
      From: l.fromLocation,
      To: l.toLocation,
      KM: Number(l.totalKm),
      Purpose: l.purpose ?? "—",
      Driver: l.driverName ?? "—",
    })),
    summary: { "Total KM": logs.reduce((s, l) => s + Number(l.totalKm), 0) },
  };
}

async function runVehicleExpense(params?: { dateFrom?: Date; dateTo?: Date }) {
  const where = dateFilter(params);
  const logs = await prisma.journeyLog.findMany({
    where,
    include: { vehicle: { select: { registrationNumber: true, make: true, model: true } } },
    orderBy: { journeyDate: "desc" },
    take: 1000,
  });

  const byVehicle: Record<string, { make: string; model: string; fuel: number; service: number; maintenance: number; tax: number; total: number }> = {};
  for (const l of logs) {
    const key = l.vehicle.registrationNumber;
    if (!byVehicle[key]) {
      byVehicle[key] = { make: l.vehicle.make ?? "—", model: l.vehicle.model ?? "—", fuel: 0, service: 0, maintenance: 0, tax: 0, total: 0 };
    }
    const fuel = Number(l.fuelExpense ?? 0);
    const service = Number(l.serviceExpense ?? 0);
    const maintenance = Number(l.maintenanceExpense ?? 0);
    const tax = Number(l.taxExpense ?? 0);
    byVehicle[key].fuel += fuel;
    byVehicle[key].service += service;
    byVehicle[key].maintenance += maintenance;
    byVehicle[key].tax += tax;
    byVehicle[key].total += fuel + service + maintenance + tax;
  }

  const rows = Object.entries(byVehicle).map(([vehicleNo, v]) => ({
    "Vehicle No": vehicleNo,
    Make: v.make,
    Model: v.model,
    Fuel: v.fuel,
    Service: v.service,
    Maintenance: v.maintenance,
    Tax: v.tax,
    Total: v.total,
  }));

  return {
    columns: ["Vehicle No", "Make", "Model", "Fuel", "Service", "Maintenance", "Tax", "Total"],
    rows,
    summary: {
      "Total fuel": rows.reduce((s, r) => s + Number(r.Fuel), 0),
      "Total service": rows.reduce((s, r) => s + Number(r.Service), 0),
      "Total maintenance": rows.reduce((s, r) => s + Number(r.Maintenance), 0),
      "Total tax": rows.reduce((s, r) => s + Number(r.Tax), 0),
      "Grand total": rows.reduce((s, r) => s + Number(r.Total), 0),
    },
  };
}

async function runVehicleReminder(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const now = new Date();
  const vehicles = await prisma.vehicle.findMany({
    where: {
      OR: [
        { rcExpiryDate: { lte: new Date(now.getTime() + 30 * 86400000) } },
        { insuranceExpiryDate: { lte: new Date(now.getTime() + 30 * 86400000) } },
        { pucExpiryDate: { lte: new Date(now.getTime() + 30 * 86400000) } },
      ],
    },
  });

  return {
    columns: ["Vehicle No", "Make", "RC Expiry", "Insurance Expiry", "PUC Expiry", "Alert"],
    rows: vehicles.map((v) => ({
      "Vehicle No": v.registrationNumber,
      Make: v.make ?? "—",
      "RC Expiry": v.rcExpiryDate,
      "Insurance Expiry": v.insuranceExpiryDate,
      "PUC Expiry": v.pucExpiryDate,
      Alert: [
        v.rcExpiryDate && new Date(v.rcExpiryDate) <= new Date(now.getTime() + 30 * 86400000) ? "RC" : null,
        v.insuranceExpiryDate && new Date(v.insuranceExpiryDate) <= new Date(now.getTime() + 30 * 86400000) ? "Insurance" : null,
        v.pucExpiryDate && new Date(v.pucExpiryDate) <= new Date(now.getTime() + 30 * 86400000) ? "PUC" : null,
      ].filter(Boolean).join(", "),
    })),
    summary: { "Total alerts": vehicles.length },
  };
}

async function runAssetCategory(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const assets = await prisma.asset.findMany({ take: 1000 });
  const byCategory: Record<string, number> = {};
  for (const a of assets) {
    const cat = a.category ?? "Uncategorized";
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(a.quantity);
  }
  return {
    columns: ["Category", "Total Quantity"],
    rows: Object.entries(byCategory).map(([category, qty]) => ({ Category: category, "Total Quantity": qty })),
    summary: { "Total assets": assets.length },
  };
}

async function runAssetWarranty(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const assets = await prisma.asset.findMany({ take: 1000 });
  return {
    columns: ["Item Code", "Category", "Make", "Model", "Year", "Qty", "Security Code"],
    rows: assets.map((a) => ({
      "Item Code": a.itemCode,
      Category: a.category ?? "—",
      Make: a.make ?? "—",
      Model: a.model ?? "—",
      Year: a.yearOfPurchase ?? "—",
      Qty: Number(a.quantity),
      "Security Code": a.securityCode ?? "—",
    })),
    summary: { "Total assets": assets.length },
  };
}

async function runDueBillsSummary(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const bills = await prisma.dueBill.findMany({
    include: { project: { select: { name: true, region: { select: { name: true } } } } },
    take: 500,
  });
  return {
    columns: ["Project", "Region", "Scheme", "Gross Amount", "Cheque Amount", "Status"],
    rows: bills.map((b) => ({
      Project: b.project.name,
      Region: b.project.region.name,
      Scheme: b.scheme,
      "Gross Amount": Number(b.grossAmount),
      "Cheque Amount": Number(b.chequeAmount),
      Status: b.status,
    })),
    summary: {
      "Total gross": bills.reduce((s, b) => s + Number(b.grossAmount), 0),
      "Total cheque": bills.reduce((s, b) => s + Number(b.chequeAmount), 0),
    },
  };
}

async function runDueBillsOutstanding(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const bills = await prisma.dueBill.findMany({
    where: { status: { not: "PAID" } },
    include: { project: { select: { name: true } } },
    take: 500,
  });
  const now = new Date();
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const b of bills) {
    const billDate = b.billDate ? new Date(b.billDate) : now;
    const age = Math.floor((now.getTime() - billDate.getTime()) / 86400000);
    if (age <= 30) buckets["0-30"]++;
    else if (age <= 60) buckets["31-60"]++;
    else if (age <= 90) buckets["61-90"]++;
    else buckets["90+"]++;
  }
  return {
    columns: ["Aging Bucket", "Count"],
    rows: Object.entries(buckets).map(([bucket, count]) => ({ "Aging Bucket": bucket, Count: count })),
    summary: { "Total outstanding": bills.length },
  };
}

async function runDueBillsClientOutstanding(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const bills = await prisma.dueBill.findMany({
    where: { status: { not: "PAID" } },
    include: { project: { select: { name: true, client: { select: { name: true } } } } },
    take: 500,
  });
  const byClient: Record<string, number> = {};
  for (const b of bills) {
    const name = b.project.client.name;
    byClient[name] = (byClient[name] ?? 0) + Number(b.chequeAmount);
  }
  return {
    columns: ["Client", "Outstanding Amount"],
    rows: Object.entries(byClient).map(([client, amount]) => ({ Client: client, "Outstanding Amount": amount })),
  };
}

async function runFundFlowSummary(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const flows = await prisma.fundFlow.findMany({
    include: { project: { select: { name: true } } },
    take: 500,
  });
  return {
    columns: ["Project", "Misc Exp", "Staff Exp", "Total Cost", "Completed Amt", "Fee Received"],
    rows: flows.map((f) => ({
      Project: f.project.name,
      "Misc Exp": Number(f.miscExp),
      "Staff Exp": Number(f.staffExp),
      "Total Cost": Number(f.totalProjectCost),
      "Completed Amt": Number(f.completedWorkAmt),
      "Fee Received": Number(f.feeReceived),
    })),
    summary: {
      "Total cost": flows.reduce((s, f) => s + Number(f.totalProjectCost), 0),
      "Total fee received": flows.reduce((s, f) => s + Number(f.feeReceived), 0),
    },
  };
}

async function runTenderApplied(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const tenders = await prisma.tender.findMany({ take: 500, orderBy: { tenderDate: "desc" } });
  return {
    columns: ["Date", "Tender Name", "Tender ID", "Department", "State", "City", "Platform", "Work Type"],
    rows: tenders.map((t) => ({
      Date: t.tenderDate,
      "Tender Name": t.name,
      "Tender ID": t.tenderId ?? "—",
      Department: t.department ?? "—",
      State: t.state ?? "—",
      City: t.city ?? "—",
      Platform: t.platform ?? "—",
      "Work Type": t.workType ?? "—",
    })),
    summary: { "Total tenders": tenders.length },
  };
}

async function runTenderStatus(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const tenders = await prisma.tender.findMany({ take: 500 });
  const byStatus: Record<string, number> = {};
  for (const t of tenders) {
    const s = t.status ?? "UNKNOWN";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  return {
    columns: ["Status", "Count"],
    rows: Object.entries(byStatus).map(([status, count]) => ({ Status: status, Count: count })),
  };
}

async function runPmtByType(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const schedules = await prisma.paymentSchedule.findMany({ take: 500, orderBy: { dueDate: "asc" } });
  return {
    columns: ["Date", "Payment Type", "Category", "Detail", "Amount", "Due Date", "Status"],
    rows: schedules.map((s) => ({
      Date: s.date,
      "Payment Type": s.paymentType,
      Category: s.category,
      Detail: s.detail ?? "—",
      Amount: Number(s.amount),
      "Due Date": s.dueDate,
      Status: s.status,
    })),
    summary: { "Total amount": schedules.reduce((s, p) => s + Number(p.amount), 0) },
  };
}

async function runPmtByCategory(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const schedules = await prisma.paymentSchedule.findMany({ take: 500 });
  const byCat: Record<string, { count: number; total: number }> = {};
  for (const s of schedules) {
    const cat = s.category;
    if (!byCat[cat]) byCat[cat] = { count: 0, total: 0 };
    byCat[cat].count++;
    byCat[cat].total += Number(s.amount);
  }
  return {
    columns: ["Category", "Count", "Total Amount"],
    rows: Object.entries(byCat).map(([category, v]) => ({
      Category: category,
      Count: v.count,
      "Total Amount": v.total,
    })),
  };
}

async function runTadaClaim(params?: { dateFrom?: Date; dateTo?: Date }) {
  const where: Record<string, unknown> = {};
  if (params?.dateFrom || params?.dateTo) {
    const and: Record<string, unknown>[] = [];
    if (params.dateFrom) {
      and.push({ toDate: { gte: params.dateFrom } });
    }
    if (params.dateTo) {
      const to = new Date(params.dateTo);
      to.setDate(to.getDate() + 1);
      and.push({ fromDate: { lt: to } });
    }
    where.AND = and;
  }
  const claims = await prisma.tadaClaim.findMany({
    where,
    include: { staff: { select: { name: true, designation: true } } },
    orderBy: { fromDate: "desc" },
    take: 500,
  });
  return {
    columns: ["Employee", "Designation", "From", "To", "Location", "Purpose", "Total ₹", "Status"],
    rows: claims.map((c) => ({
      Employee: c.staff.name,
      Designation: c.staff.designation ?? "—",
      From: c.fromDate,
      To: c.toDate,
      Location: c.location,
      Purpose: c.tourPurpose,
      "Total ₹": Number(c.totalClaimAmount),
      Status: c.status,
    })),
    summary: {
      "Total claims": claims.length,
      "Total amount": claims.reduce((s, c) => s + Number(c.totalClaimAmount), 0),
    },
  };
}

async function runTadaPendingApproval(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const claims = await prisma.tadaClaim.findMany({
    where: {
      status: { in: ["SUBMITTED", "MANAGER_APPROVED", "ACCOUNTS_VERIFIED", "FINANCE_APPROVED"] },
    },
    include: { staff: { select: { name: true } } },
    take: 500,
  });
  return {
    columns: ["Employee", "Purpose", "Total ₹", "Status", "Submitted"],
    rows: claims.map((c) => ({
      Employee: c.staff.name,
      Purpose: c.tourPurpose,
      "Total ₹": Number(c.totalClaimAmount),
      Status: c.status,
      Submitted: c.createdAt,
    })),
    summary: { "Pending count": claims.length },
  };
}

async function runTaskStatus(params?: { dateFrom?: Date; dateTo?: Date }) {
  const tasks = await prisma.task.findMany({ where: dateFilter(params), take: 1000 });
  const byStatus: Record<string, number> = {};
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }
  return {
    columns: ["Status", "Count"],
    rows: Object.entries(byStatus).map(([status, count]) => ({ Status: status, Count: count })),
    summary: { "Total tasks": tasks.length },
  };
}

async function runTaskOverdue(params?: { dateFrom?: Date; dateTo?: Date }) {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      ...dateFilter(params),
      dueDate: { lt: now },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    include: {
      assignedTo: { select: { name: true, designation: true } },
      project: { select: { name: true } },
    },
    take: 500,
  });
  return {
    columns: ["Title", "Assigned To", "Priority", "Due Date", "Days Overdue", "Project"],
    rows: tasks.map((t) => ({
      Title: t.title,
      "Assigned To": t.assignedTo.name,
      Priority: t.priority,
      "Due Date": t.dueDate,
      "Days Overdue": t.dueDate ? Math.floor((now.getTime() - new Date(t.dueDate).getTime()) / 86400000) : 0,
      Project: t.project?.name ?? "—",
    })),
    summary: { "Overdue count": tasks.length },
  };
}

async function runTaskAging(params?: { dateFrom?: Date; dateTo?: Date }) {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: { ...dateFilter(params), status: { notIn: ["COMPLETED", "CANCELLED"] } },
    take: 1000,
  });
  const buckets = { "0-7": 0, "8-15": 0, "16-30": 0, "30+": 0 };
  for (const t of tasks) {
    const age = Math.floor((now.getTime() - new Date(t.createdAt).getTime()) / 86400000);
    if (age <= 7) buckets["0-7"]++;
    else if (age <= 15) buckets["8-15"]++;
    else if (age <= 30) buckets["16-30"]++;
    else buckets["30+"]++;
  }
  return {
    columns: ["Aging Bucket", "Count"],
    rows: Object.entries(buckets).map(([bucket, count]) => ({ "Aging Bucket": bucket, Count: count })),
  };
}

// --- Vehicle Travelling Report (person wise, KM wise, city wise) ---

async function runVehicleTravelling(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const logs = await prisma.journeyLog.findMany({
    include: { vehicle: { select: { registrationNumber: true } } },
    orderBy: { journeyDate: "desc" },
    take: 500,
  });
  const byPerson: Record<string, { km: number; trips: number }> = {};
  const byCity: Record<string, { km: number; trips: number }> = {};
  for (const l of logs) {
    const person = l.driverName ?? "Unknown";
    const city = l.toLocation;
    if (!byPerson[person]) byPerson[person] = { km: 0, trips: 0 };
    if (!byCity[city]) byCity[city] = { km: 0, trips: 0 };
    byPerson[person].km += Number(l.totalKm);
    byPerson[person].trips++;
    byCity[city].km += Number(l.totalKm);
    byCity[city].trips++;
  }
  return {
    columns: ["Person", "Total KM", "Trips"],
    rows: Object.entries(byPerson).map(([person, v]) => ({ Person: person, "Total KM": v.km, Trips: v.trips })),
    summary: { "Total persons": Object.keys(byPerson).length, "Total cities": Object.keys(byCity).length },
  };
}

// --- Asset Age Report ---

async function runAssetAge(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const assets = await prisma.asset.findMany({ take: 1000 });
  return {
    columns: ["Item Code", "Name", "Category", "Year", "Age (years)", "Qty"],
    rows: assets.map((a) => {
      const isFutureYear = a.yearOfPurchase != null && a.yearOfPurchase > currentYear;
      const age = a.yearOfPurchase
        ? Math.max(0, currentYear - a.yearOfPurchase)
        : 0;
      return {
        "Item Code": a.itemCode,
        Name: a.name,
        Category: a.category ?? "—",
        Year: isFutureYear ? `${a.yearOfPurchase} ⚠ Invalid` : (a.yearOfPurchase ?? "—"),
        "Age (years)": isFutureYear ? "Invalid year" : age,
        Qty: Number(a.quantity),
      };
    }),
    summary: { "Total assets": assets.length },
  };
}

// --- Asset Office Wise Report ---

async function runAssetOffice(_params?: { dateFrom?: Date; dateTo?: Date }) {
  // Only fetch assets assigned to an OFFICE (not to a person), plus unassigned ones
  const assets = await prisma.asset.findMany({
    where: {
      OR: [
        { assigneeType: "OFFICE" },
        { assigneeType: null },
        { assignee: null },
      ],
    },
    take: 1000,
  });
  const byOffice: Record<string, Record<string, number>> = {};
  for (const a of assets) {
    // Only group by office name; skip person-assigned assets
    if (a.assigneeType === "PERSON") continue;
    const office = a.assignee ?? "Unassigned";
    const cat = a.category ?? "Uncategorized";
    if (!byOffice[office]) byOffice[office] = {};
    byOffice[office][cat] = (byOffice[office][cat] ?? 0) + Number(a.quantity);
  }
  const rows: Record<string, unknown>[] = [];
  for (const [office, cats] of Object.entries(byOffice)) {
    for (const [category, qty] of Object.entries(cats)) {
      rows.push({ Office: office, Category: category, Qty: qty });
    }
  }
  return {
    columns: ["Office", "Category", "Qty"],
    rows,
    summary: { "Total offices": Object.keys(byOffice).filter((k) => k !== "Unassigned").length },
  };
}

// --- Asset Assignee Report ---

async function runAssetAssignee(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const assets = await prisma.asset.findMany({ take: 1000 });
  const byPerson: Record<string, Record<string, number>> = {};
  for (const a of assets) {
    const person = a.responsiblePerson ?? a.assignee ?? "Unassigned";
    const cat = a.category ?? "Uncategorized";
    if (!byPerson[person]) byPerson[person] = {};
    byPerson[person][cat] = (byPerson[person][cat] ?? 0) + Number(a.quantity);
  }
  const rows: Record<string, unknown>[] = [];
  for (const [person, cats] of Object.entries(byPerson)) {
    for (const [category, qty] of Object.entries(cats)) {
      rows.push({ Person: person, Category: category, Qty: qty });
    }
  }
  return {
    columns: ["Person", "Category", "Qty"],
    rows,
    summary: { "Total persons": Object.keys(byPerson).length },
  };
}

// --- Due Bills Submission Report ---

async function runDueBillsSubmission(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const bills = await prisma.dueBill.findMany({
    include: { project: { select: { name: true, client: { select: { name: true } } } } },
    orderBy: { billDate: "desc" },
    take: 500,
  });
  return {
    columns: ["Bill Date", "Client", "Project", "Scheme", "Gross Amount", "Bill Amount", "Status"],
    rows: bills.map((b) => ({
      "Bill Date": b.billDate ?? "—",
      Client: b.project.client.name,
      Project: b.project.name,
      Scheme: b.scheme,
      "Gross Amount": Number(b.grossAmount),
      "Bill Amount": Number(b.billAmount),
      Status: b.status,
    })),
    summary: { "Total bills": bills.length, "Total gross": bills.reduce((s, b) => s + Number(b.grossAmount), 0) },
  };
}

// --- Due Bills Collection Report ---

async function runDueBillsCollection(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const bills = await prisma.dueBill.findMany({
    where: { receivedAmount: { gt: 0 } },
    include: { project: { select: { name: true } } },
    orderBy: { receiveDate: "desc" },
    take: 500,
  });
  return {
    columns: ["Receive Date", "Project", "Scheme", "Received Amount", "Cheque Amount", "Pending"],
    rows: bills.map((b) => ({
      "Receive Date": b.receiveDate ?? "—",
      Project: b.project.name,
      Scheme: b.scheme,
      "Received Amount": Number(b.receivedAmount),
      "Cheque Amount": Number(b.chequeAmount),
      Pending: Number(b.billAmount) - Number(b.receivedAmount),
    })),
    summary: {
      "Total received": bills.reduce((s, b) => s + Number(b.receivedAmount), 0),
      "Total pending": bills.reduce((s, b) => s + (Number(b.billAmount) - Number(b.receivedAmount)), 0),
    },
  };
}

// --- Due Bills Project Outstanding Report ---

async function runDueBillsProjectOutstanding(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const bills = await prisma.dueBill.findMany({
    where: { status: { not: "PAID" } },
    include: { project: { select: { name: true } } },
    take: 500,
  });
  const byProject: Record<string, number> = {};
  for (const b of bills) {
    byProject[b.project.name] = (byProject[b.project.name] ?? 0) + (Number(b.billAmount) - Number(b.receivedAmount));
  }
  return {
    columns: ["Project", "Outstanding Amount"],
    rows: Object.entries(byProject).map(([project, amount]) => ({ Project: project, "Outstanding Amount": amount })),
  };
}

// --- Due Bills Division Wise Report ---

async function runDueBillsDivision(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const bills = await prisma.dueBill.findMany({
    include: { project: { select: { region: { select: { name: true } } } } },
    take: 500,
  });
  const byRegion: Record<string, { count: number; amount: number }> = {};
  for (const b of bills) {
    const region = b.project.region.name;
    if (!byRegion[region]) byRegion[region] = { count: 0, amount: 0 };
    byRegion[region].count++;
    byRegion[region].amount += Number(b.billAmount);
  }
  return {
    columns: ["Division/Region", "Bill Count", "Total Amount"],
    rows: Object.entries(byRegion).map(([region, v]) => ({ "Division/Region": region, "Bill Count": v.count, "Total Amount": v.amount })),
  };
}

// --- Fund Flow Region Wise Report ---

async function runFundFlowRegion(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const flows = await prisma.fundFlow.findMany({
    include: { project: { select: { region: { select: { name: true } } } } },
    take: 500,
  });
  const byRegion: Record<string, { cost: number; fee: number }> = {};
  for (const f of flows) {
    const r = f.project.region.name;
    if (!byRegion[r]) byRegion[r] = { cost: 0, fee: 0 };
    byRegion[r].cost += Number(f.totalProjectCost);
    byRegion[r].fee += Number(f.feeReceived);
  }
  return {
    columns: ["Region", "Total Cost", "Fee Received"],
    rows: Object.entries(byRegion).map(([region, v]) => ({ Region: region, "Total Cost": v.cost, "Fee Received": v.fee })),
  };
}

// --- Fund Flow Project Wise Report ---

async function runFundFlowProject(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const flows = await prisma.fundFlow.findMany({
    include: { project: { select: { name: true } } },
    take: 500,
  });
  return {
    columns: ["Project", "Total Cost", "Completed Amt", "Remaining", "Fee Received", "Fee Remaining"],
    rows: flows.map((f) => ({
      Project: f.project.name,
      "Total Cost": Number(f.totalProjectCost),
      "Completed Amt": Number(f.completedWorkAmt),
      Remaining: Number(f.totalProjectCost) - Number(f.completedWorkAmt),
      "Fee Received": Number(f.feeReceived),
      "Fee Remaining": Number(f.proposedDueBillAmount) - Number(f.feeReceived),
    })),
  };
}

// --- Fund Flow Department Wise Expense Report ---

async function runFundFlowDeptExpense(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const flows = await prisma.fundFlow.findMany({
    include: { project: { select: { name: true, assignments: { include: { staff: { select: { designation: true } } } } } } },
    take: 500,
  });
  const byDept: Record<string, { misc: number; staff: number }> = {};
  for (const f of flows) {
    const depts = f.project.assignments.map((a) => a.staff.designation ?? "General");
    const dept = depts[0] ?? "General";
    if (!byDept[dept]) byDept[dept] = { misc: 0, staff: 0 };
    byDept[dept].misc += Number(f.miscExp);
    byDept[dept].staff += Number(f.staffExp);
  }
  return {
    columns: ["Department/Role", "Misc Exp", "Staff Exp", "Total"],
    rows: Object.entries(byDept).map(([dept, v]) => ({ "Department/Role": dept, "Misc Exp": v.misc, "Staff Exp": v.staff, Total: v.misc + v.staff })),
  };
}

// --- Fund Flow Monthly Cash Flow Report ---

async function runFundFlowMonthlyCashflow(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const flows = await prisma.fundFlow.findMany({
    include: { project: { select: { workOrderDate: true } } },
    take: 500,
  });
  const byMonth: Record<string, { inflow: number; outflow: number }> = {};
  for (const f of flows) {
    const d = f.project.workOrderDate;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth[monthKey]) byMonth[monthKey] = { inflow: 0, outflow: 0 };
    byMonth[monthKey].inflow += Number(f.feeReceived);
    byMonth[monthKey].outflow += Number(f.miscExp) + Number(f.staffExp);
  }
  return {
    columns: ["Month", "Inflow", "Outflow", "Net"],
    rows: Object.entries(byMonth).sort().map(([month, v]) => ({ Month: month, Inflow: v.inflow, Outflow: v.outflow, Net: v.inflow - v.outflow })),
  };
}

// --- Fund Flow Quarterly Cash Flow Report ---

async function runFundFlowQuarterlyCashflow(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const flows = await prisma.fundFlow.findMany({
    include: { project: { select: { workOrderDate: true } } },
    take: 500,
  });
  const byQ: Record<string, { inflow: number; outflow: number }> = {};
  for (const f of flows) {
    const d = f.project.workOrderDate;
    const q = Math.floor(d.getMonth() / 3) + 1;
    const qKey = `${d.getFullYear()}-Q${q}`;
    if (!byQ[qKey]) byQ[qKey] = { inflow: 0, outflow: 0 };
    byQ[qKey].inflow += Number(f.feeReceived);
    byQ[qKey].outflow += Number(f.miscExp) + Number(f.staffExp);
  }
  return {
    columns: ["Quarter", "Inflow", "Outflow", "Net"],
    rows: Object.entries(byQ).sort().map(([q, v]) => ({ Quarter: q, Inflow: v.inflow, Outflow: v.outflow, Net: v.inflow - v.outflow })),
  };
}

// --- Fund Flow Annual Cash Flow Report ---

async function runFundFlowAnnual(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const flows = await prisma.fundFlow.findMany({
    include: { project: { select: { workOrderDate: true } } },
    take: 500,
  });
  const byYear: Record<number, { inflow: number; outflow: number }> = {};
  for (const f of flows) {
    const y = f.project.workOrderDate.getFullYear();
    if (!byYear[y]) byYear[y] = { inflow: 0, outflow: 0 };
    byYear[y].inflow += Number(f.feeReceived);
    byYear[y].outflow += Number(f.miscExp) + Number(f.staffExp);
  }
  return {
    columns: ["Year", "Inflow", "Outflow", "Net"],
    rows: Object.entries(byYear).sort().map(([y, v]) => ({ Year: y, Inflow: v.inflow, Outflow: v.outflow, Net: v.inflow - v.outflow })),
  };
}

// --- Fund Flow Forecast Report ---

async function runFundFlowForecast(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const flows = await prisma.fundFlow.findMany({
    include: { project: { select: { name: true } } },
    take: 500,
  });
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1);
  const nextFY = new Date(now.getFullYear() + 1, 3, 1);
  return {
    columns: ["Period", "Expected Inflow", "Expected Outflow"],
    rows: [
      { Period: "Next Month", "Expected Inflow": flows.reduce((s, f) => s + Number(f.proposedDueBillAmount) * 0.1, 0), "Expected Outflow": flows.reduce((s, f) => s + Number(f.miscExp) * 0.1, 0) },
      { Period: "Next Quarter", "Expected Inflow": flows.reduce((s, f) => s + Number(f.proposedDueBillAmount) * 0.3, 0), "Expected Outflow": flows.reduce((s, f) => s + Number(f.miscExp) * 0.3, 0) },
      { Period: "Next Financial Year", "Expected Inflow": flows.reduce((s, f) => s + Number(f.proposedDueBillAmount), 0), "Expected Outflow": flows.reduce((s, f) => s + Number(f.miscExp) + Number(f.staffExp), 0) },
    ],
    summary: { "Forecast year": now.getFullYear() },
  };
}

// --- Tender Fee EMD Report ---

async function runTenderFeeEmd(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const tenders = await prisma.tender.findMany({
    where: { OR: [{ tenderFeeAmount: { not: null } }, { emdAmount: { not: null } }] },
    take: 500,
    orderBy: { tenderDate: "desc" },
  });
  const now = new Date();
  return {
    columns: ["Date", "Tender Name", "Tender Fee", "Fee Mode", "EMD Amount", "EMD Mode", "EMD Date", "EMD Return Date", "Refund Status", "Tender Status"],
    rows: tenders.map((t) => {
      let refundStatus = "—";
      if (t.emdAmount && Number(t.emdAmount) > 0) {
        if (t.emdReturnCollectionDate) {
          refundStatus = "Refunded";
        } else if (["WON", "LOST", "WITHDRAWN", "CANCELLED"].includes(t.status)) {
          refundStatus = "Pending Refund";
        } else {
          refundStatus = "Submitted (in process)";
        }
      }
      return {
        Date: t.tenderDate,
        "Tender Name": t.name,
        "Tender Fee": t.tenderFeeAmount ? Number(t.tenderFeeAmount) : "—",
        "Fee Mode": t.tenderFeeMode ?? "—",
        "EMD Amount": t.emdAmount ? Number(t.emdAmount) : "—",
        "EMD Mode": t.emdMode ?? "—",
        "EMD Date": t.emdDate ?? "—",
        "EMD Return Date": t.emdReturnCollectionDate ?? "—",
        "Refund Status": refundStatus,
        "Tender Status": t.status,
      };
    }),
    summary: {
      "Total tender fees": tenders.reduce((s, t) => s + (t.tenderFeeAmount ? Number(t.tenderFeeAmount) : 0), 0),
      "Total EMD deposited": tenders.reduce((s, t) => s + (t.emdAmount ? Number(t.emdAmount) : 0), 0),
      "EMD refunded": tenders.filter((t) => t.emdReturnCollectionDate).reduce((s, t) => s + (t.emdAmount ? Number(t.emdAmount) : 0), 0),
      "EMD pending refund": tenders.filter((t) => !t.emdReturnCollectionDate && t.emdAmount && ["WON", "LOST", "WITHDRAWN", "CANCELLED"].includes(t.status)).reduce((s, t) => s + (t.emdAmount ? Number(t.emdAmount) : 0), 0),
    },
  };
}

// --- Payment by Amount Report ---

async function runPmtByAmount(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const schedules = await prisma.paymentSchedule.findMany({ take: 500, orderBy: { amount: "desc" } });
  return {
    columns: ["Date", "Category", "Detail", "Amount", "Due Date", "Status"],
    rows: schedules.map((s) => ({
      Date: s.date,
      Category: s.category,
      Detail: s.detail ?? "—",
      Amount: Number(s.amount),
      "Due Date": s.dueDate,
      Status: s.status,
    })),
    summary: {
      "GST total": schedules.filter((s) => s.category === "GST").reduce((sum, s) => sum + Number(s.amount), 0),
      "TDS total": schedules.filter((s) => s.category === "TDS").reduce((sum, s) => sum + Number(s.amount), 0),
      "Vehicle Loan total": schedules.filter((s) => s.category === "VEHICLE_LOAN").reduce((sum, s) => sum + Number(s.amount), 0),
    },
  };
}

// --- WIP Work Order Report ---

async function runWipWorkOrder(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const wips = await prisma.workInProgress.findMany({
    include: { project: { select: { name: true } } },
    take: 500,
  });
  return {
    columns: ["Project", "Work Order Date", "Amount of Work", "Security Deposit", "SD Status", "Status"],
    rows: wips.map((w) => ({
      Project: w.project.name,
      "Work Order Date": w.workOrderDate ?? "—",
      "Amount of Work": w.amountOfWorkDone ? Number(w.amountOfWorkDone) : "—",
      "Security Deposit": w.securityDepositAmount ? Number(w.securityDepositAmount) : "—",
      "SD Status": w.securityDepositStatus ?? "—",
      Status: w.status,
    })),
  };
}

// --- WIP Staff Allocation Report ---

async function runWipStaffAllocation(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const wips = await prisma.workInProgress.findMany({
    include: {
      project: { select: { name: true } },
      hoCoordinator: { select: { name: true, designation: true } },
      roCoordinator: { select: { name: true, designation: true } },
      assignments: { include: { staff: { select: { name: true, designation: true } } } },
    },
    take: 500,
  });
  const rows: Record<string, unknown>[] = [];
  for (const w of wips) {
    if (w.hoCoordinator) rows.push({ Project: w.project.name, Staff: w.hoCoordinator.name, Post: "HO Coordinator", Level: "—" });
    if (w.roCoordinator) rows.push({ Project: w.project.name, Staff: w.roCoordinator.name, Post: "RO Coordinator", Level: "—" });
    for (const a of w.assignments) {
      rows.push({ Project: w.project.name, Staff: a.staff.name, Post: a.staff.designation ?? "—", Level: a.level });
    }
  }
  return {
    columns: ["Project", "Staff", "Post", "Level"],
    rows,
    summary: { "Total allocations": rows.length },
  };
}

// --- WIP RA Bill Report ---

async function runWipRaBill(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const wips = await prisma.workInProgress.findMany({
    include: { project: { select: { name: true, client: { select: { name: true } } } } },
    take: 500,
  });
  const rows: Record<string, unknown>[] = [];
  for (const w of wips) {
    for (let i = 1; i <= 4; i++) {
      const amt = w[`raBill${i}Amount` as keyof typeof w] as unknown as { toNumber?: () => number } | null;
      const date = w[`raBill${i}Date` as keyof typeof w] as unknown as Date | null;
      const fee = w[`raBill${i}SaecFee` as keyof typeof w] as unknown as { toNumber?: () => number } | null;
      if (amt) {
        rows.push({
          Project: w.project.name,
          Client: w.project.client.name,
          "RA Bill": `RA Bill ${i}`,
          Date: date ?? "—",
          Amount: Number(amt),
          "SAEC Fee": fee ? Number(fee) : "—",
        });
      }
    }
  }
  return {
    columns: ["Project", "Client", "RA Bill", "Date", "Amount", "SAEC Fee"],
    rows,
    summary: { "Total RA bills": rows.length },
  };
}

// --- WIP Final Progress Report ---

async function runWipFinalProgress(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const wips = await prisma.workInProgress.findMany({
    include: { project: { select: { name: true } } },
    take: 500,
  });
  return {
    columns: ["Project", "RA Bill 1", "RA Bill 2", "RA Bill 3", "RA Bill 4", "Final Progress", "Balance"],
    rows: wips.map((w) => {
      const r1 = w.raBill1Amount ? Number(w.raBill1Amount) : 0;
      const r2 = w.raBill2Amount ? Number(w.raBill2Amount) : 0;
      const r3 = w.raBill3Amount ? Number(w.raBill3Amount) : 0;
      const r4 = w.raBill4Amount ? Number(w.raBill4Amount) : 0;
      const total = r1 + r2 + r3 + r4;
      const final = w.finalProgressAmount ? Number(w.finalProgressAmount) : 0;
      return {
        Project: w.project.name,
        "RA Bill 1": r1,
        "RA Bill 2": r2,
        "RA Bill 3": r3,
        "RA Bill 4": r4,
        "Final Progress": final,
        Balance: final - total,
      };
    }),
  };
}

// --- TADA Expense Report ---

async function runTadaExpense(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const claims = await prisma.tadaClaim.findMany({ take: 500 });
  const totals = { travel: 0, accommodation: 0, food: 0, localConveyance: 0, other: 0 };
  for (const c of claims) {
    totals.travel += Number(c.travelExpense);
    totals.accommodation += Number(c.accommodationExp);
    totals.food += Number(c.foodExpense);
    totals.localConveyance += Number(c.localConveyance);
    totals.other += Number(c.otherExpense);
  }
  return {
    columns: ["Expense Type", "Amount"],
    rows: [
      { "Expense Type": "Travel", Amount: totals.travel },
      { "Expense Type": "Accommodation", Amount: totals.accommodation },
      { "Expense Type": "Food", Amount: totals.food },
      { "Expense Type": "Local Conveyance", Amount: totals.localConveyance },
      { "Expense Type": "Other", Amount: totals.other },
    ],
    summary: { "Grand total": Object.values(totals).reduce((a, b) => a + b, 0) },
  };
}

// --- TADA Rejected Claims Report ---

async function runTadaRejected(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const claims = await prisma.tadaClaim.findMany({
    where: { status: "MANAGER_REJECTED" },
    include: { staff: { select: { name: true, designation: true } } },
    take: 500,
  });
  return {
    columns: ["Employee", "Designation", "Purpose", "Total ₹", "Rejected Reason", "Date"],
    rows: claims.map((c) => ({
      Employee: c.staff.name,
      Designation: c.staff.designation ?? "—",
      Purpose: c.tourPurpose,
      "Total ₹": Number(c.totalClaimAmount),
      "Rejected Reason": c.rejectedReason ?? "—",
      Date: c.createdAt,
    })),
    summary: { "Rejected count": claims.length },
  };
}

// --- TADA Approved Claims Report ---

async function runTadaApproved(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const claims = await prisma.tadaClaim.findMany({
    where: { status: { in: ["MANAGER_APPROVED", "ACCOUNTS_VERIFIED", "FINANCE_APPROVED", "PAID"] } },
    include: { staff: { select: { name: true } } },
    take: 500,
    orderBy: { managerApprovedAt: "desc" },
  });
  return {
    columns: ["Employee", "Purpose", "Total ₹", "Status", "Approved At"],
    rows: claims.map((c) => ({
      Employee: c.staff.name,
      Purpose: c.tourPurpose,
      "Total ₹": Number(c.totalClaimAmount),
      Status: c.status,
      "Approved At": c.managerApprovedAt ?? "—",
    })),
    summary: { "Approved count": claims.length, "Total amount": claims.reduce((s, c) => s + Number(c.totalClaimAmount), 0) },
  };
}

// --- TADA Advance Adjustment Report ---

async function runTadaAdvanceAdjustment(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const claims = await prisma.tadaClaim.findMany({
    where: { advanceAmount: { not: null } },
    include: { staff: { select: { name: true } } },
    take: 500,
  });
  return {
    columns: ["Employee", "Purpose", "Advance", "Adjusted", "Balance"],
    rows: claims.map((c) => ({
      Employee: c.staff.name,
      Purpose: c.tourPurpose,
      Advance: c.advanceAmount ? Number(c.advanceAmount) : 0,
      Adjusted: c.adjustedAmount ? Number(c.adjustedAmount) : 0,
      Balance: c.balanceAmount ? Number(c.balanceAmount) : (c.advanceAmount ? Number(c.advanceAmount) - (c.adjustedAmount ? Number(c.adjustedAmount) : 0) : 0),
    })),
    summary: {
      "Total advance": claims.reduce((s, c) => s + (c.advanceAmount ? Number(c.advanceAmount) : 0), 0),
      "Total adjusted": claims.reduce((s, c) => s + (c.adjustedAmount ? Number(c.adjustedAmount) : 0), 0),
    },
  };
}

// --- TADA Payment Report ---

async function runTadaPayment(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const claims = await prisma.tadaClaim.findMany({
    where: { status: "PAID", paidAt: { not: null } },
    include: { staff: { select: { name: true } } },
    take: 500,
    orderBy: { paidAt: "desc" },
  });
  return {
    columns: ["Payment Date", "Employee", "Purpose", "Amount", "Payment Mode"],
    rows: claims.map((c) => ({
      "Payment Date": c.paidAt ?? "—",
      Employee: c.staff.name,
      Purpose: c.tourPurpose,
      Amount: Number(c.totalClaimAmount),
      "Payment Mode": c.paymentMode ?? "—",
    })),
    summary: { "Total paid": claims.reduce((s, c) => s + Number(c.totalClaimAmount), 0) },
  };
}

// --- TADA Travel Summary Report ---

async function runTadaTravelSummary(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const claims = await prisma.tadaClaim.findMany({
    include: { staff: { select: { name: true } } },
    take: 500,
  });
  const byLocation: Record<string, { trips: number; amount: number }> = {};
  for (const c of claims) {
    const loc = c.location;
    if (!byLocation[loc]) byLocation[loc] = { trips: 0, amount: 0 };
    byLocation[loc].trips++;
    byLocation[loc].amount += Number(c.totalClaimAmount);
  }
  return {
    columns: ["City/Location", "Trips", "Total Amount"],
    rows: Object.entries(byLocation).map(([loc, v]) => ({ "City/Location": loc, Trips: v.trips, "Total Amount": v.amount })),
    summary: { "Total cities": Object.keys(byLocation).length },
  };
}

// --- TADA Budget vs Actual Report ---

async function runTadaBudgetVsActual(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const claims = await prisma.tadaClaim.findMany({
    include: { staff: { select: { name: true, designation: true } } },
    take: 500,
  });
  const byDept: Record<string, { budget: number; actual: number }> = {};
  for (const c of claims) {
    const dept = c.staff.designation ?? "General";
    if (!byDept[dept]) byDept[dept] = { budget: 0, actual: 0 };
    byDept[dept].actual += Number(c.totalClaimAmount);
    byDept[dept].budget += Number(c.advanceAmount ?? 0);
  }
  return {
    columns: ["Department/Role", "Budget (Advance)", "Actual (Claimed)", "Variance"],
    rows: Object.entries(byDept).map(([dept, v]) => ({ "Department/Role": dept, "Budget (Advance)": v.budget, "Actual (Claimed)": v.actual, Variance: v.budget - v.actual })),
  };
}

// --- TADA Employee Ledger Report ---

async function runTadaEmployeeLedger(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const claims = await prisma.tadaClaim.findMany({
    include: { staff: { select: { name: true } } },
    take: 1000,
  });
  const byEmp: Record<string, { opening: number; claimed: number; approved: number; paid: number }> = {};
  for (const c of claims) {
    const name = c.staff.name;
    if (!byEmp[name]) byEmp[name] = { opening: 0, claimed: 0, approved: 0, paid: 0 };
    byEmp[name].claimed += Number(c.totalClaimAmount);
    if (["MANAGER_APPROVED", "ACCOUNTS_VERIFIED", "FINANCE_APPROVED", "PAID"].includes(c.status)) {
      byEmp[name].approved += Number(c.totalClaimAmount);
    }
    if (c.status === "PAID") byEmp[name].paid += Number(c.totalClaimAmount);
  }
  return {
    columns: ["Employee", "Opening Balance", "Claimed", "Approved", "Paid", "Balance"],
    rows: Object.entries(byEmp).map(([emp, v]) => ({ Employee: emp, "Opening Balance": v.opening, Claimed: v.claimed, Approved: v.approved, Paid: v.paid, Balance: v.approved - v.paid })),
  };
}

// --- TADA Overdue Claim Submission Report ---

async function runTadaOverdueClaim(_params?: { dateFrom?: Date; dateTo?: Date }) {
  const now = new Date();
  const limit = new Date(now.getTime() - 7 * 86400000);
  const claims = await prisma.tadaClaim.findMany({
    where: {
      status: "DRAFT",
      toDate: { lt: limit },
    },
    include: { staff: { select: { name: true } } },
    take: 500,
  });
  return {
    columns: ["Employee", "Purpose", "Tour End Date", "Days Since Tour", "Amount", "Status"],
    rows: claims.map((c) => ({
      Employee: c.staff.name,
      Purpose: c.tourPurpose,
      "Tour End Date": c.toDate,
      "Days Since Tour": Math.floor((now.getTime() - new Date(c.toDate).getTime()) / 86400000),
      Amount: Number(c.totalClaimAmount),
      Status: c.status,
    })),
    summary: { "Overdue count": claims.length },
  };
}

// --- Task Employee Report ---

async function runTaskEmployee(params?: { dateFrom?: Date; dateTo?: Date }) {
  const tasks = await prisma.task.findMany({
    where: dateFilter(params),
    include: { assignedTo: { select: { name: true } } },
    take: 1000,
  });
  const byEmp: Record<string, { assigned: number; completed: number; pending: number; overdue: number }> = {};
  const now = new Date();
  for (const t of tasks) {
    const name = t.assignedTo.name;
    if (!byEmp[name]) byEmp[name] = { assigned: 0, completed: 0, pending: 0, overdue: 0 };
    byEmp[name].assigned++;
    if (t.status === "COMPLETED") byEmp[name].completed++;
    else if (t.status !== "CANCELLED") byEmp[name].pending++;
    if (t.dueDate && new Date(t.dueDate) < now && t.status !== "COMPLETED" && t.status !== "CANCELLED") byEmp[name].overdue++;
  }
  return {
    columns: ["Employee", "Assigned", "Completed", "Pending", "Overdue"],
    rows: Object.entries(byEmp).map(([emp, v]) => ({ Employee: emp, Assigned: v.assigned, Completed: v.completed, Pending: v.pending, Overdue: v.overdue })),
  };
}

// --- Task Department Report ---

async function runTaskDepartment(params?: { dateFrom?: Date; dateTo?: Date }) {
  const tasks = await prisma.task.findMany({
    where: dateFilter(params),
    include: { assignedTo: { select: { designation: true } } },
    take: 1000,
  });
  const byDept: Record<string, { total: number; completed: number; pending: number }> = {};
  for (const t of tasks) {
    const dept = t.assignedTo.designation ?? "General";
    if (!byDept[dept]) byDept[dept] = { total: 0, completed: 0, pending: 0 };
    byDept[dept].total++;
    if (t.status === "COMPLETED") byDept[dept].completed++;
    else if (t.status !== "CANCELLED") byDept[dept].pending++;
  }
  return {
    columns: ["Department/Role", "Total", "Completed", "Pending"],
    rows: Object.entries(byDept).map(([dept, v]) => ({ "Department/Role": dept, Total: v.total, Completed: v.completed, Pending: v.pending })),
  };
}

// --- Task Priority Report ---

async function runTaskPriority(params?: { dateFrom?: Date; dateTo?: Date }) {
  const tasks = await prisma.task.findMany({ where: dateFilter(params), take: 1000 });
  const byPriority: Record<string, number> = {};
  for (const t of tasks) {
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
  }
  return {
    columns: ["Priority", "Count"],
    rows: Object.entries(byPriority).map(([priority, count]) => ({ Priority: priority, Count: count })),
  };
}

// --- Task Completion Report ---

async function runTaskCompletion(params?: { dateFrom?: Date; dateTo?: Date }) {
  const tasks = await prisma.task.findMany({
    where: { ...dateFilter(params), status: "COMPLETED", completedAt: { not: null } },
    include: { assignedTo: { select: { name: true } } },
    take: 500,
    orderBy: { completedAt: "desc" },
  });
  return {
    columns: ["Title", "Assigned To", "Completed At", "Priority"],
    rows: tasks.map((t) => ({ Title: t.title, "Assigned To": t.assignedTo.name, "Completed At": t.completedAt ?? "—", Priority: t.priority })),
    summary: { "Completed count": tasks.length },
  };
}

// --- Task Assignment Report ---

async function runTaskAssignment(params?: { dateFrom?: Date; dateTo?: Date }) {
  const tasks = await prisma.task.findMany({
    where: dateFilter(params),
    include: {
      assignedTo: { select: { name: true } },
      assignedBy: { select: { name: true } },
    },
    take: 1000,
  });
  const byAssigner: Record<string, number> = {};
  const byAssignee: Record<string, number> = {};
  for (const t of tasks) {
    const assigner = t.assignedBy?.name ?? "System";
    const assignee = t.assignedTo.name;
    byAssigner[assigner] = (byAssigner[assigner] ?? 0) + 1;
    byAssignee[assignee] = (byAssignee[assignee] ?? 0) + 1;
  }
  return {
    columns: ["Assigned By", "Tasks Assigned", "Assigned To", "Tasks Received"],
    rows: (() => {
      const assigners = Object.entries(byAssigner).map(([by, count]) => ({
        "Assigned By": by,
        "Tasks Assigned": count,
        "Assigned To": "",
        "Tasks Received": "",
      }));
      const assignees = Object.entries(byAssignee).map(([to, count]) => ({
        "Assigned By": "",
        "Tasks Assigned": "",
        "Assigned To": to,
        "Tasks Received": count,
      }));
      const maxLen = Math.max(assigners.length, assignees.length);
      return Array.from({ length: maxLen }, (_, i) => ({
        "Assigned By": assigners[i]?.["Assigned By"] ?? "",
        "Tasks Assigned": assigners[i]?.["Tasks Assigned"] ?? "",
        "Assigned To": assignees[i]?.["Assigned To"] ?? "",
        "Tasks Received": assignees[i]?.["Tasks Received"] ?? "",
      }));
    })(),
    summary: {
      "Total assigners": Object.keys(byAssigner).length,
      "Total assignees": Object.keys(byAssignee).length,
    },
  };
}

// --- Task Project Wise Report ---

async function runTaskProjectWise(params?: { dateFrom?: Date; dateTo?: Date }) {
  const tasks = await prisma.task.findMany({
    where: { ...dateFilter(params), projectId: { not: null } },
    include: { project: { select: { name: true } } },
    take: 1000,
  });
  const byProject: Record<string, { open: number; completed: number; pending: number }> = {};
  for (const t of tasks) {
    const proj = t.project?.name ?? "Unknown";
    if (!byProject[proj]) byProject[proj] = { open: 0, completed: 0, pending: 0 };
    if (t.status === "COMPLETED") byProject[proj].completed++;
    else if (t.status === "OPEN") byProject[proj].open++;
    else if (t.status !== "CANCELLED") byProject[proj].pending++;
  }
  return {
    columns: ["Project", "Open", "Completed", "Pending"],
    rows: Object.entries(byProject).map(([proj, v]) => ({ Project: proj, Open: v.open, Completed: v.completed, Pending: v.pending })),
  };
}

// --- Task-wise Employee Summary ---

async function runTaskWiseEmployee(params?: { dateFrom?: Date; dateTo?: Date }) {
  const tasks = await prisma.task.findMany({
    where: dateFilter(params),
    include: {
      assignedTo: { select: { name: true, designation: true } },
      assignedBy: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return {
    columns: ["Task", "Employee", "Department", "Status", "Priority", "Due Date", "Project", "Assigned By"],
    rows: tasks.map((t) => ({
      Task: t.title,
      Employee: t.assignedTo.name,
      Department: t.assignedTo.designation ?? "—",
      Status: t.status,
      Priority: t.priority,
      "Due Date": t.dueDate ?? "—",
      Project: t.project?.name ?? "—",
      "Assigned By": t.assignedBy?.name ?? "—",
    })),
    summary: { "Total tasks": tasks.length },
  };
}

// --- Task Rework Report ---

async function runTaskRework(params?: { dateFrom?: Date; dateTo?: Date }) {
  const tasks = await prisma.task.findMany({
    where: { ...dateFilter(params), reworkCount: { gt: 0 } },
    include: { assignedTo: { select: { name: true, designation: true } } },
    take: 500,
  });
  return {
    columns: ["Title", "Assigned To", "Department", "Rework Count", "Rework Reason", "Status"],
    rows: tasks.map((t) => ({
      Title: t.title,
      "Assigned To": t.assignedTo.name,
      Department: t.assignedTo.designation ?? "—",
      "Rework Count": t.reworkCount,
      "Rework Reason": t.reworkReason ?? "—",
      Status: t.status,
    })),
    summary: { "Total reworked": tasks.length, "Total rework cycles": tasks.reduce((s, t) => s + t.reworkCount, 0) },
  };
}

import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "json" | "xlsx";

export interface ModuleExportConfig {
  label: string;
  model: string;
  excludedFields: string[];
  dateFields: string[];
  decimalFields: string[];
  intFields: string[];
  enumFields: Record<string, string[]>;
  relationFields: string[];
  booleanFields?: string[];
}

export const MODULE_EXPORT_CONFIGS: Record<string, ModuleExportConfig> = {
  fundFlow: {
    label: "Fund Flow",
    model: "fundFlow",
    excludedFields: [],
    dateFields: [],
    decimalFields: [
      "miscExp",
      "staffExp",
      "totalProjectCost",
      "completedWorkAmt",
      "proposedDueBillAmount",
      "feeReceived",
    ],
    intFields: [],
    enumFields: {},
    relationFields: ["project"],
  },
  dueBills: {
    label: "Due Bills",
    model: "dueBill",
    excludedFields: [],
    dateFields: ["billDate", "receiveDate"],
    decimalFields: [
      "grossAmount",
      "sgst",
      "cgst",
      "billAmount",
      "chequeAmount",
      "sd",
      "itTds",
      "receivedAmount",
    ],
    intFields: [],
    enumFields: {
      status: ["PENDING", "PARTIAL", "PAID", "ON_HOLD", "CANCELLED"],
    },
    relationFields: ["project"],
  },
  wip: {
    label: "WIP",
    model: "workInProgress",
    excludedFields: [],
    dateFields: [
      "loiReceiptDate",
      "agreementDate",
      "workOrderDate",
      "stipulatedCompletionDate",
      "targetCompletionDate",
      "securityDepositReturnDate",
      "raBill1Date",
      "raBill2Date",
      "raBill3Date",
      "raBill4Date",
      "completionDate",
    ],
    decimalFields: [
      "timeLimitMonths",
      "securityDepositAmount",
      "amountOfWorkDone",
      "finalProgressAmount",
      "raBill1Amount",
      "raBill1SaecFee",
      "raBill1ProjectExpense",
      "raBill2Amount",
      "raBill2SaecFee",
      "raBill2ProjectExpense",
      "raBill3Amount",
      "raBill3SaecFee",
      "raBill3ProjectExpense",
      "raBill4Amount",
      "raBill4SaecFee",
      "raBill4ProjectExpense",
    ],
    intFields: [],
    enumFields: {
      status: ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"],
    },
    relationFields: ["project", "hoCoordinator", "roCoordinator"],
  },
  contractors: {
    label: "Contractors",
    model: "contractor",
    excludedFields: [],
    dateFields: ["agreementDate", "workOrderDate"],
    decimalFields: ["contractAmount", "scheduleBAmount", "finalProgressAmount", "finalProgressProjectExpense"],
    intFields: [],
    enumFields: {},
    relationFields: ["projects"],
  },
  tenders: {
    label: "Tenders",
    model: "tender",
    excludedFields: [],
    dateFields: [
      "tenderDate",
      "preBidMeetingDate",
      "biddingLastDate",
      "dateOfOpening",
      "tenderFeeDate",
      "emdDate",
      "emdReturnCollectionDate",
    ],
    decimalFields: ["tenderFeeAmount", "emdAmount", "l1Amount", "l2Amount", "l3Amount"],
    intFields: [],
    enumFields: {
      status: ["UNDER_PREPARATION", "SUBMITTED", "UNDER_EVALUATION", "WON", "LOST", "WITHDRAWN", "CANCELLED"],
    },
    relationFields: [],
  },
  paymentSchedules: {
    label: "Payment Schedules",
    model: "paymentSchedule",
    excludedFields: [],
    dateFields: ["date", "dueDate"],
    decimalFields: ["amount"],
    intFields: [],
    enumFields: {
      category: ["EXCISE", "GST", "TDS", "VEHICLE_LOAN"],
      status: ["PENDING", "PAID", "OVERDUE", "CANCELLED"],
    },
    relationFields: [],
  },
  vehicleLogBook: {
    label: "Vehicle Log Book",
    model: "vehicle",
    excludedFields: [],
    dateFields: [
      "rcExpiryDate",
      "insuranceExpiryDate",
      "pucExpiryDate",
      "tyreWarrantyExpiryDate",
      "batteryWarrantyExpiryDate",
    ],
    decimalFields: [],
    intFields: ["year"],
    enumFields: {
      status: ["ACTIVE", "INACTIVE", "SOLD"],
    },
    relationFields: ["journeyLogs"],
  },
  assets: {
    label: "Assets",
    model: "asset",
    excludedFields: [],
    dateFields: [],
    decimalFields: ["quantity", "assignedQuantity"],
    intFields: ["quantity", "assignedQuantity", "yearOfPurchase"],
    enumFields: {
      status: ["AVAILABLE", "ASSIGNED", "UNDER_MAINTENANCE", "DISPOSED"],
    },
    relationFields: [],
  },
  inOutRegister: {
    label: "In-Out Register",
    model: "inOutRegister",
    excludedFields: [],
    dateFields: ["documentDate", "receivedDate", "replyDate"],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: ["client", "actionSuggestedStaff", "documents", "ccStaff"],
  },
  auditLogs: {
    label: "Audit Logs",
    model: "auditLog",
    excludedFields: ["metadata"],
    dateFields: ["createdAt"],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: ["user"],
  },
  tadaBills: {
    label: "TADA Bills",
    model: "tadaClaim",
    excludedFields: [],
    dateFields: [
      "fromDate",
      "toDate",
      "managerApprovedAt",
      "accountsVerifiedAt",
      "financeApprovedAt",
      "paidAt",
    ],
    decimalFields: [
      "travelExpense",
      "accommodationExp",
      "foodExpense",
      "localConveyance",
      "otherExpense",
      "totalClaimAmount",
      "advanceAmount",
      "adjustedAmount",
      "balanceAmount",
    ],
    intFields: [],
    enumFields: {
      status: ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "ACCOUNTS_VERIFIED", "FINANCE_APPROVED", "PAID", "REJECTED"],
    },
    relationFields: ["staff"],
  },
  tasks: {
    label: "Tasks",
    model: "task",
    excludedFields: [],
    dateFields: ["dueDate", "completedAt"],
    decimalFields: [],
    intFields: ["reworkCount"],
    enumFields: {
      status: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED", "ON_HOLD", "CANCELLED"],
      priority: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
    },
    relationFields: ["assignedTo", "assignedBy", "project"],
  },
  clients: {
    label: "Clients",
    model: "client",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: ["contacts"],
  },
  staff: {
    label: "Staff",
    model: "staff",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: ["region", "reportingManager"],
    booleanFields: ["isActive"],
  },
  masters_region: {
    label: "Master - Region",
    model: "region",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_department: {
    label: "Master - Department",
    model: "department",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_designation: {
    label: "Master - Designation",
    model: "designation",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_state: {
    label: "Master - State",
    model: "state",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_city: {
    label: "Master - City",
    model: "city",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: ["state"],
  },
  masters_platform: {
    label: "Master - Platform",
    model: "platform",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_paymentType: {
    label: "Master - Payment Type",
    model: "paymentType",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_assetCategory: {
    label: "Master - Asset Category",
    model: "assetCategory",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_assetMake: {
    label: "Master - Asset Make",
    model: "assetMake",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_assetModel: {
    label: "Master - Asset Model",
    model: "assetModel",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: ["make"],
  },
  masters_orderMaster: {
    label: "Master - Order Master",
    model: "orderMaster",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_workMaster: {
    label: "Master - Work Master",
    model: "workMaster",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_dprMaster: {
    label: "Master - DPR Master",
    model: "dprMaster",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_tsAaMaster: {
    label: "Master - TS/AA Master",
    model: "tsAaMaster",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_typeMaster: {
    label: "Master - Type Master",
    model: "typeMaster",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_workOrderMaster: {
    label: "Master - Work Order Master",
    model: "workOrderMaster",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_drawingMaster: {
    label: "Master - Drawing Master",
    model: "drawingMaster",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
  masters_contactMaster: {
    label: "Master - Contact Master",
    model: "contactMaster",
    excludedFields: [],
    dateFields: [],
    decimalFields: [],
    intFields: [],
    enumFields: {},
    relationFields: [],
  },
};

export const EXPORTABLE_MODULES = Object.keys(MODULE_EXPORT_CONFIGS);

function flattenRow(
  row: Record<string, unknown>,
  config: ModuleExportConfig
): Record<string, string> {
  const flat: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    if (config.excludedFields.includes(key)) continue;
    if (config.relationFields.includes(key)) {
      if (value === null) {
        flat[key] = "";
      } else if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
          flat[key] = `[${value.length} items]`;
        } else {
          const obj = value as Record<string, unknown>;
          flat[key] = String(obj.name ?? obj.id ?? JSON.stringify(obj));
        }
      } else {
        flat[key] = String(value ?? "");
      }
      continue;
    }
    if (config.dateFields.includes(key) && value instanceof Date) {
      flat[key] = value.toISOString().split("T")[0];
      continue;
    }
    if (
      config.decimalFields.includes(key) &&
      (value instanceof Prisma.Decimal || typeof value === "object")
    ) {
      flat[key] = String(value);
      continue;
    }
    if (config.booleanFields?.includes(key) && typeof value === "boolean") {
      flat[key] = value ? "Active" : "Inactive";
      continue;
    }
    if (value === null || value === undefined) {
      flat[key] = "";
    } else if (typeof value === "object") {
      flat[key] = JSON.stringify(value);
    } else {
      flat[key] = String(value);
    }
  }

  return flat;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(rows: Record<string, unknown>[], config: ModuleExportConfig): string {
  if (rows.length === 0) {
    return "";
  }

  const flatRows = rows.map((row) => flattenRow(row, config));
  const headers = Object.keys(flatRows[0]);

  const lines: string[] = [headers.join(",")];

  for (const row of flatRows) {
    const values = headers.map((h) => escapeCsvField(row[h] ?? ""));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

export function rowsToJson(rows: Record<string, unknown>[], config: ModuleExportConfig): string {
  const flatRows = rows.map((row) => flattenRow(row, config));
  return JSON.stringify(flatRows, null, 2);
}

export function rowsToXlsx(rows: Record<string, unknown>[], config: ModuleExportConfig): Buffer {
  const flatRows = rows.map((row) => flattenRow(row, config));
  const ws = XLSX.utils.json_to_sheet(flatRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, config.label.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function exportData(
  rows: Record<string, unknown>[],
  moduleKey: string,
  format: ExportFormat
): string | Buffer {
  const config = MODULE_EXPORT_CONFIGS[moduleKey];
  if (!config) throw new Error(`Unknown module: ${moduleKey}`);

  if (format === "json") {
    return rowsToJson(rows, config);
  }
  if (format === "xlsx") {
    return rowsToXlsx(rows, config);
  }
  return rowsToCsv(rows, config);
}

export function parseCsv(csvContent: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) return rows;

  const headers = parseCsvLine(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    const isEmpty = Object.values(row).every((v) => v.trim() === "");
    if (!isEmpty) {
      rows.push(row);
    }
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

export function parseJson(jsonContent: string): Record<string, unknown>[] {
  const parsed = JSON.parse(jsonContent);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON content must be an array of objects");
  }
  return parsed as Record<string, unknown>[];
}

export function getExportFilename(moduleKey: string, format: ExportFormat): string {
  const config = MODULE_EXPORT_CONFIGS[moduleKey];
  const date = new Date().toISOString().split("T")[0];
  const ext = format === "csv" ? "csv" : format === "json" ? "json" : "xlsx";
  return `${config.label.toLowerCase().replace(/\s+/g, "-")}-${date}.${ext}`;
}

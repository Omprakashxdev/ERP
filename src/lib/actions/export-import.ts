"use server";

import { prisma } from "@/lib/prisma";
import { addMonths, getIndianFinancialYear } from "@/lib/date-utils";
import {
  issueRegisterSerialNo,
  bumpRegisterSerialCounter,
} from "@/lib/register-serial";
import { issueEmployeeCode } from "@/lib/employee-code";
import { Decimal } from "@prisma/client/runtime/library";
import {
  withPermission,
  checkRateLimit,
  audit,
  ActionResult,
} from "./wrapper";
import {
  exportRequestSchema,
  importRequestSchema,
  ExportRequestInput,
  ImportRequestInput,
} from "@/lib/schemas/export-import";
import {
  exportData,
  parseCsv,
  parseJson,
  getExportFilename,
  MODULE_EXPORT_CONFIGS,
  CSV_BOM,
} from "@/lib/export-import";

function parseImportDate(value: string): Date | null {
  if (!value || value.trim() === "") return null;
  const trimmed = value.trim();

  const lower = trimmed.toLowerCase();
  if (
    lower === "false" ||
    lower === "true" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "none" ||
    lower === "-" ||
    lower === "--" ||
    lower === "null" ||
    lower === "nil" ||
    lower === "0"
  ) {
    return null;
  }

  // Try ISO / YYYY-MM-DD — only trust new Date() for ISO-like formats
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  let d: Date;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts1 = trimmed.split(/[\/\-]/);
  if (parts1.length === 3) {
    const day = parseInt(parts1[0], 10);
    const month = parseInt(parts1[1], 10) - 1;
    let year = parseInt(parts1[2], 10);
    if (year < 100) year += 2000;
    d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) return d;
  }

  // Try MM/DD/YYYY or MM-DD-YYYY
  if (parts1.length === 3) {
    const month = parseInt(parts1[0], 10) - 1;
    const day = parseInt(parts1[1], 10);
    let year = parseInt(parts1[2], 10);
    if (year < 100) year += 2000;
    d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) return d;
  }

  // Try "25-Jul-2026" or "25 Jul 2026" or "Jul 25, 2026"
  const textMonthMatch = trimmed.match(/(\d{1,2})[\s\-]([A-Za-z]{3,})[\s\-](\d{2,4})/);
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const monthStr = textMonthMatch[2].charAt(0).toUpperCase() + textMonthMatch[2].slice(1).toLowerCase();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months.indexOf(monthStr);
    let year = parseInt(textMonthMatch[3], 10);
    if (year < 100) year += 2000;
    if (month >= 0) {
      d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Try "Jul 25, 2026" or "Jul 25 2026"
  const textMonthMatch2 = trimmed.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (textMonthMatch2) {
    const monthStr = textMonthMatch2[1].charAt(0).toUpperCase() + textMonthMatch2[1].slice(1).toLowerCase();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months.indexOf(monthStr);
    const day = parseInt(textMonthMatch2[2], 10);
    let year = parseInt(textMonthMatch2[3], 10);
    if (year < 100) year += 2000;
    if (month >= 0) {
      d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

async function generateImportEmployeeCode(): Promise<string> {
  return issueEmployeeCode();
}

function autoCorrectNumber(value: string): string {
  // Strip currency symbols, "Rs"/"Rs." prefixes, commas, and spaces — but keep decimal dots
  let corrected = value.replace(/[\u20B9]/g, "").replace(/Rs\.?/gi, "").replace(/,/g, "").replace(/\s/g, "");
  // Handle negative in parentheses e.g. (100.50) → -100.50
  if (/^\(.+\)$/.test(corrected)) {
    corrected = "-" + corrected.slice(1, -1);
  }
  return corrected;
}

function autoCorrectEnum(value: string, allowed: string[]): string | null {
  const normalized = value.toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (allowed.includes(normalized)) return normalized;
  if (allowed.includes(value)) return value;

  // Fuzzy: try without trailing underscores, or partial match
  const lower = value.toLowerCase().replace(/\s+/g, "_");
  for (const candidate of allowed) {
    const candidateLower = candidate.toLowerCase();
    if (candidateLower === lower) return candidate;
    if (candidateLower.startsWith(lower) || lower.startsWith(candidateLower)) return candidate;
  }

  // Common aliases
  const aliases: Record<string, string> = {
    "yes": "PAID",
    "no": "PENDING",
    "done": "COMPLETED",
    "complete": "COMPLETED",
    "cancel": "CANCELLED",
    "cancelled": "CANCELLED",
    "active": "ACTIVE",
    "inactive": "INACTIVE",
    "hold": "ON_HOLD",
    "on_hold": "ON_HOLD",
    "in_progress": "IN_PROGRESS",
    "progress": "IN_PROGRESS",
    "wip": "IN_PROGRESS",
    "open": "OPEN",
    "close": "COMPLETED",
    "closed": "COMPLETED",
    "reject": "REJECTED",
    "rejected": "REJECTED",
    "submit": "SUBMITTED",
    "submitted": "SUBMITTED",
    "approve": "MANAGER_APPROVED",
    "approved": "MANAGER_APPROVED",
  };
  const alias = aliases[lower];
  if (alias && allowed.includes(alias)) return alias;

  return null;
}

async function fetchModuleData(module: string): Promise<Record<string, unknown>[]> {
  switch (module) {
    case "fundFlow":
      return prisma.fundFlow.findMany({
        include: { project: { select: { name: true, id: true } } },
      }) as Promise<Record<string, unknown>[]>;

    case "dueBills":
      return prisma.dueBill.findMany({
        include: { project: { select: { name: true, id: true } } },
      }) as Promise<Record<string, unknown>[]>;

    case "wip":
      return prisma.workInProgress.findMany({
        include: {
          project: { select: { name: true, id: true } },
          hoCoordinator: { select: { name: true, id: true } },
          roCoordinator: { select: { name: true, id: true } },
        },
      }) as Promise<Record<string, unknown>[]>;

    case "contractors":
      return prisma.contractor.findMany() as Promise<Record<string, unknown>[]>;

    case "tenders":
      return prisma.tender.findMany() as Promise<Record<string, unknown>[]>;

    case "paymentSchedules":
      return prisma.paymentSchedule.findMany() as Promise<Record<string, unknown>[]>;

    case "vehicleLogBook":
      return prisma.vehicle.findMany({
        include: { journeyLogs: { select: { id: true } } },
      }) as Promise<Record<string, unknown>[]>;

    case "assets":
      return prisma.asset.findMany() as Promise<Record<string, unknown>[]>;

    case "inOutRegister":
      return prisma.inOutRegister.findMany({
        include: {
          client: { select: { name: true, id: true } },
          actionSuggestedStaff: { select: { name: true, id: true } },
          receivedByStaff: { select: { name: true, id: true } },
          mode: { select: { name: true, id: true } },
          project: { select: { name: true, id: true } },
          documents: { select: { path: true } },
          ccStaff: { include: { staff: { select: { name: true } } } },
          parentInward: { select: { documentRefNo: true } },
        },
      }) as Promise<Record<string, unknown>[]>;

    case "auditLogs":
      return prisma.auditLog.findMany({
        include: { user: { select: { name: true, email: true, id: true } } },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }) as Promise<Record<string, unknown>[]>;

    case "tadaBills":
      return prisma.tadaClaim.findMany({
        include: { staff: { select: { name: true, id: true } } },
      }) as Promise<Record<string, unknown>[]>;

    case "tasks":
      return prisma.task.findMany({
        include: {
          assignedTo: { select: { name: true, id: true } },
          assignedBy: { select: { name: true, id: true } },
          project: { select: { name: true, id: true } },
        },
      }) as Promise<Record<string, unknown>[]>;

    case "clients":
      return prisma.client.findMany({
        include: { contacts: true, _count: { select: { projects: true } } },
      }) as Promise<Record<string, unknown>[]>;

    case "staff":
      return prisma.staff.findMany({
        include: { region: true, reportingManager: true },
      }) as Promise<Record<string, unknown>[]>;

    default: {
      // Generic masters_* modules fetch straight from their model.
      const config = MODULE_EXPORT_CONFIGS[module];
      if (config && module.startsWith("masters_")) {
        const model = (prisma as any)[config.model];
        if (!model) throw new Error(`Unknown module: ${module}`);
        const orderBy =
          module === "masters_dprMaster" || module === "masters_tsAaMaster"
            ? { referenceNumber: "asc" as const }
            : { name: "asc" as const };
        return model.findMany({ orderBy }) as Promise<
          Record<string, unknown>[]
        >;
      }
      throw new Error(`Unknown module: ${module}`);
    }
  }
}

export async function exportModule(
  input: ExportRequestInput
): Promise<ActionResult<{ content: string; filename: string; format: string; isBase64: boolean }>> {
  return withPermission("exportImport", "read", async (user) => {
    const parsed = exportRequestSchema.parse(input);
    await checkRateLimit(user.id);

    const rows = await fetchModuleData(parsed.module);
    const raw = exportData(rows, parsed.module, parsed.format);
    const filename = getExportFilename(parsed.module, parsed.format);

    const isBase64 = parsed.format === "xlsx";
    const content = isBase64
      ? Buffer.isBuffer(raw)
        ? raw.toString("base64")
        : String(raw)
      : String(raw);

    await audit(user.id, "export", "ExportImport", parsed.module, {
      module: parsed.module,
      format: parsed.format,
      rowCount: rows.length,
    });

    return { content, filename, format: parsed.format, isBase64 };
  });
}

export async function importModule(
  input: ImportRequestInput
): Promise<ActionResult<{ imported: number; errors: string[]; corrections: string[] }>> {
  return withPermission("exportImport", "create", async (user) => {
    const parsed = importRequestSchema.parse(input);
    await checkRateLimit(user.id);

    const rawRows =
      parsed.format === "csv"
        ? parseCsv(parsed.data)
        : parseJson(parsed.data);

    if (rawRows.length === 0) {
      throw new Error("No data rows found in import file");
    }

    const errors: string[] = [];
    const corrections: string[] = [];
    let imported = 0;

    const config = MODULE_EXPORT_CONFIGS[parsed.module];
    if (!config) {
      throw new Error(`Unknown module: ${parsed.module}`);
    }

    // 1) Intra-sheet dedup: collapse duplicate rows inside the file before processing.
    const { rows, rowNumbers } = dedupeImportRows(parsed.module, rawRows, corrections);

    // 2) Inter-system idempotency: prefetch existing natural keys once (single query).
    let dedupIndex: ImportDedupIndex | null = null;
    try {
      dedupIndex = await buildImportDedupIndex(parsed.module);
    } catch {
      dedupIndex = null;
    }

    for (let i = 0; i < rows.length; i++) {
      const rowNum = rowNumbers[i];
      try {
        const row = rows[i];
        const data: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(row)) {
          if (key === "id" || key === "createdAt" || key === "updatedAt") continue;
          if (config.relationFields.includes(key)) continue;
          if (value === "" || value === null || value === undefined) continue;

          const rawValue = String(value).trim();
          if (rawValue === "") continue;

          if (config.dateFields.includes(key)) {
            // Smart auto-healing: if an inOutRegister row has an inward reference number in replyDueDate (e.g. INW/2026-27/001)
            if (
              parsed.module === "inOutRegister" &&
              key === "replyDueDate" &&
              (String(row.direction).toUpperCase() === "OUTWARD" ||
                rawValue.startsWith("INW/") ||
                rawValue.startsWith("OUT/"))
            ) {
              data.parentInwardRefNo = rawValue;
              corrections.push(
                `Row ${rowNum}: Auto-detected reference number "${rawValue}" in replyDueDate column and mapped it to parentInwardRefNo`
              );
              continue;
            }

            const parsedDate = parseImportDate(rawValue);
            if (parsedDate === null) {
              throw new Error(
                `Invalid date "${rawValue}" for ${key}. Use DD/MM/YYYY or YYYY-MM-DD format.`
              );
            }
            data[key] = parsedDate;
          } else if (config.decimalFields.includes(key)) {
            const corrected = autoCorrectNumber(rawValue);
            const parsedDecimal = parseFloat(corrected);
            if (isNaN(parsedDecimal)) {
              throw new Error(`Invalid number "${rawValue}" for ${key}`);
            }
            if (corrected !== rawValue) {
              corrections.push(`Row ${rowNum}: Auto-corrected ${key} "${rawValue}" → "${parsedDecimal}"`);
            }
            data[key] = parsedDecimal;
          } else if (config.intFields.includes(key)) {
            const corrected = autoCorrectNumber(rawValue);
            const parsedInt = parseInt(corrected, 10);
            if (isNaN(parsedInt)) {
              throw new Error(`Invalid whole number "${rawValue}" for ${key}`);
            }
            if (corrected !== rawValue) {
              corrections.push(`Row ${rowNum}: Auto-corrected ${key} "${rawValue}" → "${parsedInt}"`);
            }
            data[key] = parsedInt;
          } else if (config.enumFields[key]) {
            const allowed = config.enumFields[key];
            const corrected = autoCorrectEnum(rawValue, allowed);
            if (!corrected) {
              throw new Error(
                `Invalid value "${rawValue}" for ${key}. Allowed: ${allowed.join(", ")}`
              );
            }
            if (corrected !== rawValue) {
              corrections.push(`Row ${rowNum}: Auto-corrected ${key} "${rawValue}" → "${corrected}"`);
            }
            data[key] = corrected;
          } else if (config.booleanFields?.includes(key)) {
            const lower = rawValue.toLowerCase();
            if (lower === "true" || lower === "1" || lower === "yes" || lower === "active") {
              data[key] = true;
            } else if (lower === "false" || lower === "0" || lower === "no" || lower === "inactive") {
              data[key] = false;
            } else {
              throw new Error(`Invalid boolean value "${rawValue}" for ${key}. Use true/false, yes/no, or 1/0.`);
            }
          } else {
            data[key] = rawValue;
          }
        }

        // Resolve relation fields by name lookup
        await resolveRelations(parsed.module, data, row as Record<string, string>, corrections, rowNum - 1);

        // Skip rows whose natural key already exists in the database
        const dupDesc = dedupIndex?.match(data);
        if (dupDesc) {
          corrections.push(
            `Row ${rowNum}: Skipped existing record (${dupDesc}) — already exists in database`
          );
          continue;
        }

        switch (parsed.module) {
          case "contractors": {
            const allowedFields = [
              "name", "contactPerson", "phone", "email", "address", "contractAmount",
              "agreementDate", "workOrderDate", "tenderId", "detailedOrder", "workName",
              "workType", "serviceType", "dprReference", "tsAaReference", "scheduleBAmount",
              "scheduleBPath", "raBillDetails", "raBillsPath", "finalProgressAmount",
              "finalProgressProjectExpense", "finalProgressPath", "dprDocumentPath",
              "tsAaDocumentPath", "tenderCopyPath", "contactProofPath", "workOrderCopyPath",
              "drawingsPath", "completionCertificatePath"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            await prisma.contractor.create({ data: cleanData as never });
            break;
          }
          case "tenders": {
            const allowedFields = [
              "name", "tenderId", "department", "state", "city", "platform", "workName",
              "workType", "serviceType", "tenderDate", "preBidMeetingDate", "preBidMeetingAttended",
              "biddingLastDate", "dateOfOpening", "tenderFeeAmount", "tenderFeeDate",
              "tenderFeeMode", "emdAmount", "emdDate", "emdMode", "emdReturnCollectionDate",
              "l1ContractorName", "l1City", "l1Amount", "l2ContractorName", "l2City", "l2Amount",
              "l3ContractorName", "l3City", "l3Amount", "negotiationMeeting", "advertisementCopyPath",
              "remarks", "status"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            await prisma.tender.create({ data: cleanData as never });
            break;
          }
          case "paymentSchedules": {
            const allowedFields = [
              "date", "paymentType", "category", "detail", "amount", "dueDate", "status",
              "paymentFrequency", "receiptPath", "remarks"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            await prisma.paymentSchedule.create({ data: cleanData as never });
            break;
          }
          case "assets": {
            if (data.officeLocation) {
              if (!data.assignee) {
                data.assignee = data.officeLocation;
                data.assigneeType = "OFFICE";
              }
              delete data.officeLocation;
            }
            if (!data.itemCode || String(data.itemCode).trim() === "") {
              data.itemCode = `AST-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
            }
            if (!data.securityCode || String(data.securityCode).trim() === "") {
              const cat = data.category ? String(data.category).slice(0, 3) : "Ast";
              const name = data.name ? String(data.name).split(/\s+/)[0].slice(0, 10) : "Item";
              const make = data.make ? String(data.make).split(/\s+/)[0].slice(0, 10) : "Gen";
              const count = await prisma.asset.count();
              data.securityCode = `${cat}/${name}/${make}/${count + 1}`;
            }
            const allowedAssetFields = [
              "itemCode", "name", "category", "make", "model", "yearOfPurchase",
              "quantity", "securityCode", "billWarrantyPath", "assigneeType",
              "assignee", "assignedQuantity", "responsiblePerson", "currentHolderId",
              "status", "remarks"
            ];
            const cleanAssetData: Record<string, unknown> = {};
            for (const key of allowedAssetFields) {
              if (data[key] !== undefined && data[key] !== null) {
                cleanAssetData[key] = data[key];
              }
            }
            await prisma.asset.create({ data: cleanAssetData as never });
            break;
          }
          case "fundFlow": {
            const allowedFields = [
              "projectId", "miscExp", "staffExp", "totalProjectCost", "completedWorkAmt",
              "proposedDueBillAmount", "feeReceived"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            await prisma.fundFlow.upsert({
              where: { projectId: cleanData.projectId as string },
              create: cleanData as any,
              update: cleanData as any,
            });
            break;
          }
          case "dueBills": {
            const allowedFields = [
              "projectId", "scheme", "grossAmount", "sgst", "cgst", "billAmount",
              "chequeAmount", "sd", "itTds", "receivedAmount", "billDate", "receiveDate",
              "status", "remarks", "billCopyPath"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            await prisma.dueBill.create({ data: cleanData as never });
            break;
          }
          case "wip": {
            const allowedFields = [
              "projectId", "status", "loiReceiptDate", "loiCopyPath", "agreementDate",
              "agreementCopyPath", "workOrderDate", "workOrderCopyPath", "timeLimitMonths",
              "stipulatedCompletionDate", "targetCompletionDate", "hoCoordinatorId", "roCoordinatorId",
              "securityDepositAmount", "securityDepositStatus", "securityDepositReturnDate",
              "securityDepositCopyPath", "amountOfWorkDone", "finalProgressAmount", "finalProgressPath",
              "raBill1Amount", "raBill1Date", "raBill1SaecFee", "raBill1ProjectExpense", "raBill1Path",
              "raBill2Amount", "raBill2Date", "raBill2SaecFee", "raBill2ProjectExpense", "raBill2Path",
              "raBill3Amount", "raBill3Date", "raBill3SaecFee", "raBill3ProjectExpense", "raBill3Path",
              "raBill4Amount", "raBill4Date", "raBill4SaecFee", "raBill4ProjectExpense", "raBill4Path",
              "annexure3aPath", "completionCertificatePath", "completionDate"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            await prisma.workInProgress.upsert({
              where: { projectId: cleanData.projectId as string },
              create: cleanData as any,
              update: cleanData as any,
            });
            break;
          }
          case "vehicleLogBook": {
            const allowedFields = [
              "registrationNumber", "make", "model", "year", "status", "rcNumber", "rcExpiryDate",
              "insurancePolicyNumber", "insuranceExpiryDate", "pucNumber", "pucExpiryDate",
              "tyreWarrantyExpiryDate", "batteryWarrantyExpiryDate", "rcCopyPath", "insuranceCopyPath",
              "pucCopyPath"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            if (cleanData.registrationNumber) {
              await prisma.vehicle.upsert({
                where: { registrationNumber: cleanData.registrationNumber as string },
                create: cleanData as never,
                update: cleanData as never,
              });
            } else {
              await prisma.vehicle.create({ data: cleanData as never });
            }
            break;
          }
          case "inOutRegister": {
            if (data.subject) {
              if (data.details) {
                data.details = `${data.subject}: ${data.details}`;
              } else {
                data.details = String(data.subject);
              }
            }
            const allowedFields = [
              "direction", "serialNo", "documentDate", "receivedDate", "documentRefNo", "clientId",
              "details", "actionSuggestedStaffId", "modeId",
              "inwardType", "receivedByPersonName", "receivedByStaffId", "department", "replyDueDate", "parentInwardId",
              "projectId"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }

            // Customer requirement: document number + action-suggested staff
            // are mandatory for every imported entry, both directions.
            if (
              !cleanData.documentRefNo ||
              String(cleanData.documentRefNo).trim() === ""
            ) {
              throw new Error(
                "Document number is required — provide the Incoming/Outgoing Document Ref. No."
              );
            }
            cleanData.documentRefNo = String(cleanData.documentRefNo).trim();
            if (!cleanData.actionSuggestedStaffId) {
              throw new Error(
                "Action suggested to is required — provide a staff name in the actionSuggestedStaff column."
              );
            }

            // Same inward-type rule as the form: new entries may only be
            // Informative or Action Required.
            if (
              cleanData.direction === "INWARD" &&
              cleanData.inwardType != null &&
              !["INFORMATIVE", "ACTION_REQUIRED"].includes(
                String(cleanData.inwardType)
              )
            ) {
              throw new Error(
                `Invalid inward type "${cleanData.inwardType}" — allowed: INFORMATIVE, ACTION_REQUIRED`
              );
            }

            // A modeId arriving as a raw column (rather than resolved from
            // the "mode" name column) must still exist and be active.
            if (cleanData.modeId) {
              const modeRow = await prisma.modeMaster.findUnique({
                where: { id: String(cleanData.modeId) },
                select: { isActive: true },
              });
              if (!modeRow) {
                throw new Error("Selected mode does not exist — check the mode column");
              }
              if (!modeRow.isActive) {
                throw new Error("Selected mode is inactive and cannot be used for new entries");
              }
            }
            // Outward letters are going outside, so they NEVER have pending reply or deadline
            if (cleanData.direction === "OUTWARD") {
              cleanData.replyDueDate = null;
              // Project linkage is inward-only — outward rows inherit the
              // linked inward's project for display instead.
              cleanData.projectId = null;

              // If parent inward ref no was provided in CSV, resolve it to parentInwardId
              const parentRef =
                data.parentInwardRefNo ||
                (row as Record<string, string>).parentInwardRefNo ||
                data.parentInward ||
                (row as Record<string, string>).parentInward ||
                data.inwardRefNo ||
                (row as Record<string, string>).inwardRefNo;

              if (parentRef && !cleanData.parentInwardId) {
                const parentDoc = await prisma.inOutRegister.findFirst({
                  where: {
                    OR: [
                      { serialNo: { equals: String(parentRef).trim(), mode: "insensitive" } },
                      { documentRefNo: { equals: String(parentRef).trim(), mode: "insensitive" } },
                    ],
                  },
                  select: { id: true, serialNo: true, documentRefNo: true },
                });
                if (parentDoc) {
                  cleanData.parentInwardId = parentDoc.id;
                  corrections.push(
                    `Row ${rowNum}: Linked Outward dispatch to Inward letter "${parentDoc.serialNo || parentDoc.documentRefNo || parentRef}"`
                  );
                }
              }
            }

            // Any existing project may be linked — client scoping was
            // removed per customer direction; only existence is enforced.
            if (cleanData.projectId) {
              const linkedProject = await prisma.project.findUnique({
                where: { id: String(cleanData.projectId) },
                select: { id: true },
              });
              if (!linkedProject) {
                throw new Error("Selected project does not exist — check the project column");
              }
            }

            // InOutRegister schema requires both documentDate and receivedDate (not nullable)
            if (!cleanData.receivedDate) {
              cleanData.receivedDate = (cleanData.documentDate as Date) || new Date();
            }
            if (!cleanData.documentDate) {
              cleanData.documentDate = (cleanData.receivedDate as Date) || new Date();
            }

            // Serial issuance is server-authoritative: a CSV-supplied
            // serialNo is kept and bumps the counter so future issues
            // never collide; a blank one is issued from the counter.
            await prisma.$transaction(async (tx) => {
              if (cleanData.serialNo && String(cleanData.serialNo).trim() !== "") {
                await bumpRegisterSerialCounter(
                  tx,
                  String(cleanData.serialNo).trim()
                );
              } else {
                const dir =
                  (cleanData.direction as "INWARD" | "OUTWARD") || "INWARD";
                cleanData.serialNo = await issueRegisterSerialNo(tx, dir);
                corrections.push(
                  `Row ${rowNum}: Auto-generated ${dir} serial number "${cleanData.serialNo}"`
                );
              }
              await tx.inOutRegister.create({ data: cleanData as never }).catch(
                (err) => {
                  if ((err as { code?: string })?.code === "P2002") {
                    throw new Error(
                      "This document number is already registered. Please enter a different number."
                    );
                  }
                  throw err;
                }
              );
            });
            break;
          }
          case "tadaBills": {
            const allowedFields = [
              "staffId", "fromDate", "toDate", "location", "tourPurpose", "travelExpense",
              "accommodationExp", "foodExpense", "localConveyance", "otherExpense",
              "totalClaimAmount", "advanceAmount", "adjustedAmount", "balanceAmount",
              "status", "paymentMode", "paidAt", "remarks"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            await prisma.tadaClaim.create({ data: cleanData as never });
            break;
          }
          case "tasks": {
            const allowedFields = [
              "title", "description", "assignedToId", "assignedById", "projectId",
              "department", "reviewerId", "percentageCompletion", "activityLog",
              "sourceModule", "sourceEntityId", "dueDate", "completedAt", "status",
              "priority", "reworkCount", "reworkReason"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            await prisma.task.create({ data: cleanData as never });
            break;
          }
          case "clients": {
            if (data.code && !data.abbreviation) {
              data.abbreviation = String(data.code).slice(0, 8);
            }
            if (data.gstin && !data.gstNumber) {
              data.gstNumber = String(data.gstin);
            }
            if (data.pan && !data.panNumber) {
              data.panNumber = String(data.pan);
            }
            const allowedClientFields = [
              "name", "abbreviation", "address", "gstNumber", "panNumber", "phone", "website"
            ];
            const cleanClientData: Record<string, unknown> = {};
            for (const key of allowedClientFields) {
              if (data[key] !== undefined && data[key] !== null) {
                cleanClientData[key] = data[key];
              }
            }
            await prisma.client.create({ data: cleanClientData as never });
            break;
          }
          case "staff": {
            const suppliedCode = data.employeeCode ? String(data.employeeCode).trim() : "";
            data.employeeCode = await generateImportEmployeeCode();
            corrections.push(
              suppliedCode
                ? `Row ${rowNum}: Supplied Employee Code "${suppliedCode}" ignored — system assigned "${data.employeeCode}"`
                : `Row ${rowNum}: Auto-generated Employee Code "${data.employeeCode}"`
            );
            if (data.isActive === undefined) {
              data.isActive = true;
            }
            const allowedFields = [
              "name", "email", "phone", "employeeCode", "designation", "regionId",
              "isActive", "reportingManagerId"
            ];
            const cleanData: Record<string, unknown> = {};
            for (const key of allowedFields) {
              if (data[key] !== undefined && data[key] !== null) cleanData[key] = data[key];
            }
            await prisma.staff.create({ data: cleanData as never });
            break;
          }
          case "masters_region":
            await prisma.region.create({ data: data as never });
            break;
          case "masters_department":
            await prisma.department.create({ data: data as never });
            break;
          case "masters_designation":
            await prisma.designation.create({ data: data as never });
            break;
          case "masters_state":
            await prisma.state.create({ data: data as never });
            break;
          case "masters_city":
            await prisma.city.create({ data: data as never });
            break;
          case "masters_platform":
            await prisma.platform.create({ data: data as never });
            break;
          case "masters_paymentType":
            await prisma.paymentType.create({ data: data as never });
            break;
          case "masters_assetCategory":
            await prisma.assetCategory.create({ data: data as never });
            break;
          case "masters_assetMake":
            await prisma.assetMake.create({ data: data as never });
            break;
          case "masters_assetModel":
            await prisma.assetModel.create({ data: data as never });
            break;
          case "masters_orderMaster":
            await prisma.orderMaster.create({ data: data as never });
            break;
          case "masters_workMaster":
            await prisma.workMaster.create({ data: data as never });
            break;
          case "masters_dprMaster":
            await prisma.dprMaster.create({ data: data as never });
            break;
          case "masters_tsAaMaster":
            await prisma.tsAaMaster.create({ data: data as never });
            break;
          case "masters_typeMaster":
            await (prisma as any).typeMaster.create({ data: data as never });
            break;
          case "masters_workOrderMaster":
            await (prisma as any).workOrderMaster.create({ data: data as never });
            break;
          case "masters_drawingMaster":
            await (prisma as any).drawingMaster.create({ data: data as never });
            break;
          case "masters_contactMaster":
            await (prisma as any).contactMaster.create({ data: data as never });
            break;
          case "masters_modeMaster": {
            // Mode names dedupe on trimmed + case-insensitive comparison,
            // matching the ModeMaster lower(btrim(name)) unique index.
            const modeName = data.name ? String(data.name).trim() : "";
            if (!modeName) throw new Error("Mode name is required");
            const existing = await prisma.modeMaster.findFirst({
              where: { name: { equals: modeName, mode: "insensitive" } },
            });
            if (existing) {
              throw new Error(`Mode "${modeName}" already exists. Mode names must be unique.`);
            }
            await prisma.modeMaster.create({
              data: {
                name: modeName,
                isActive:
                  data.isActive === undefined || data.isActive === null
                    ? true
                    : Boolean(data.isActive),
              },
            });
            break;
          }
          default:
            errors.push(`Row ${rowNum}: Import not supported for module ${parsed.module}`);
            continue;
        }
        dedupIndex?.add(data);
        imported++;
      } catch (err) {
        if ((err as { code?: string } | null)?.code === "P2002") {
          corrections.push(
            `Row ${rowNum}: Skipped existing record — already exists in database (unique constraint)`
          );
          continue;
        }
        errors.push(
          `Row ${rowNum}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    await audit(user.id, "import", "ExportImport", parsed.module, {
      module: parsed.module,
      format: parsed.format,
      imported,
      errorCount: errors.length,
      correctionCount: corrections.length,
    });

    return { imported, errors, corrections };
  });
}

export async function getModuleList(): Promise<
  ActionResult<{ key: string; label: string }[]>
> {
  return withPermission("exportImport", "read", async () => {
    return Object.entries(MODULE_EXPORT_CONFIGS).map(([key, config]) => ({
      key,
      label: config.label,
    }));
  });
}

interface RelationResolver {
  lookup: (value: string, row?: Record<string, string>) => Promise<string | null>;
  fuzzyLookup: (value: string, row?: Record<string, string>) => Promise<string | null>;
  masterLabel: string;
  autoCreate?: (value: string, row: Record<string, string>) => Promise<string | null>;
}

async function autoCreateProjectFromImport(name: string, row: Record<string, string>): Promise<string> {
  const regionName = row["project_region"];
  const clientName = row["project_client"];
  let region = regionName ? await prisma.region.findFirst({ where: { name: { equals: regionName, mode: "insensitive" } } }) : await prisma.region.findFirst();
  if (!region) region = await prisma.region.create({ data: { name: regionName || "Default Region" } });
  let client = clientName ? await prisma.client.findFirst({ where: { name: { equals: clientName, mode: "insensitive" } } }) : await prisma.client.findFirst();
  if (!client) client = await prisma.client.create({ data: { name: clientName || "Default Client" } });

  const workOrderDate = row["project_workOrderDate"] ? new Date(row["project_workOrderDate"]) : new Date();
  const timeLimitNum = row["project_timeLimitMonths"] ? parseFloat(row["project_timeLimitMonths"]) : 12;
  const timeLimitMonths = new Decimal(isNaN(timeLimitNum) ? 12 : timeLimitNum);
  const additionalTimeMonths = new Decimal((timeLimitMonths.toNumber() * 0.5).toFixed(4));
  const targetTimeLimitMonths = new Decimal((timeLimitMonths.toNumber() + additionalTimeMonths.toNumber()).toFixed(4));
  const stipulatedCompletionDate = addMonths(workOrderDate, timeLimitMonths);
  const targetCompletionDate = addMonths(workOrderDate, targetTimeLimitMonths);

  const rawFee = String(
    row["project_totalFee"] ?? row["totalFee"] ?? row["proposedDueBillAmount"] ?? "0"
  ).trim();
  const totalFee = /^-?\d+(\.\d+)?$/.test(rawFee)
    ? new Decimal(rawFee)
    : new Decimal("0");

  const rawCost = row["totalProjectCost"] ?? row["project_estimatedCost"] ?? "0";
  const costNum = parseFloat(rawCost);
  const estimatedCost = new Decimal(isNaN(costNum) ? 0 : costNum);

  const p = await prisma.project.create({
    data: {
      name,
      regionId: region.id,
      clientId: client.id,
      workOrderDate,
      timeLimitMonths,
      additionalTimeMonths,
      targetTimeLimitMonths,
      stipulatedCompletionDate,
      targetCompletionDate,
      estimatedCost,
      totalFee,
      workType: row["project_workType"] || "AUTO",
      serviceType: row["project_serviceType"] || "AUTO",
    },
  });

  await prisma.fundFlow.upsert({
    where: { projectId: p.id },
    create: { projectId: p.id, totalProjectCost: estimatedCost },
    update: {},
  });

  return p.id;
}

async function resolveRelations(
  module: string,
  data: Record<string, unknown>,
  row: Record<string, string>,
  corrections: string[],
  rowIndex: number
): Promise<void> {
  const relationResolvers: Record<string, Record<string, RelationResolver>> = {
    fundFlow: {
      project: {
        masterLabel: "Project master",
        lookup: async (name: string) => {
          const p = await prisma.project.findFirst({ where: { name } });
          return p?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const p = await prisma.project.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
          });
          return p?.id ?? null;
        },
        autoCreate: async (name: string, row: Record<string, string>) => {
          return await autoCreateProjectFromImport(name, row);
        },
      },
    },
    dueBills: {
      project: {
        masterLabel: "Project master",
        lookup: async (name: string) => {
          const p = await prisma.project.findFirst({ where: { name } });
          return p?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const p = await prisma.project.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
          });
          return p?.id ?? null;
        },
        autoCreate: async (name: string, row: Record<string, string>) => {
          return await autoCreateProjectFromImport(name, row);
        },
      },
    },
    wip: {
      project: {
        masterLabel: "Project master",
        lookup: async (name: string) => {
          const p = await prisma.project.findFirst({ where: { name } });
          return p?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const p = await prisma.project.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
          });
          return p?.id ?? null;
        },
        autoCreate: async (name: string, row: Record<string, string>) => {
          return await autoCreateProjectFromImport(name, row);
        },
      },
      hoCoordinator: {
        masterLabel: "Staff master",
        lookup: async (name: string) => {
          const s = await prisma.staff.findFirst({ where: { name, isActive: true } });
          return s?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const s = await prisma.staff.findFirst({
            where: { name: { equals: name, mode: "insensitive" }, isActive: true },
          });
          return s?.id ?? null;
        },
      },
      roCoordinator: {
        masterLabel: "Staff master",
        lookup: async (name: string) => {
          const s = await prisma.staff.findFirst({ where: { name, isActive: true } });
          return s?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const s = await prisma.staff.findFirst({
            where: { name: { equals: name, mode: "insensitive" }, isActive: true },
          });
          return s?.id ?? null;
        },
      },
    },
    tenders: {
      concernAuthority: {
        masterLabel: "Staff master",
        lookup: async (name: string) => {
          const s = await prisma.staff.findFirst({ where: { name, isActive: true } });
          return s?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const s = await prisma.staff.findFirst({
            where: { name: { equals: name, mode: "insensitive" }, isActive: true },
          });
          return s?.id ?? null;
        },
      },
    },

    assets: {
      currentHolder: {
        masterLabel: "Staff master",
        lookup: async (name: string) => {
          const s = await prisma.staff.findFirst({ where: { name, isActive: true } });
          return s?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const s = await prisma.staff.findFirst({
            where: { name: { equals: name, mode: "insensitive" }, isActive: true },
          });
          return s?.id ?? null;
        },
      },
    },
    inOutRegister: {
      client: {
        masterLabel: "Client master",
        lookup: async (name: string) => {
          const clean = name.trim();
          const c = await prisma.client.findFirst({
            where: {
              OR: [
                { name: { equals: clean, mode: "insensitive" } },
                { abbreviation: { equals: clean, mode: "insensitive" } },
              ],
            },
          });
          return c?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const clean = name.trim();
          const c = await prisma.client.findFirst({
            where: {
              OR: [
                { name: { contains: clean, mode: "insensitive" } },
                { abbreviation: { contains: clean, mode: "insensitive" } },
              ],
            },
          });
          return c?.id ?? null;
        },
        autoCreate: async (name: string) => {
          try {
            const clean = name.trim();
            const created = await prisma.client.create({
              data: {
                name: clean,
                abbreviation: clean.length <= 8 ? clean.toUpperCase() : clean.slice(0, 8).toUpperCase(),
              },
              select: { id: true },
            });
            return created.id;
          } catch {
            const existing = await prisma.client.findFirst({
              where: { name: { equals: name.trim(), mode: "insensitive" } },
              select: { id: true },
            });
            return existing?.id ?? null;
          }
        },
      },
      actionSuggestedStaff: {
        masterLabel: "Staff master",
        lookup: async (name: string) => {
          const clean = name.trim();
          const s = await prisma.staff.findFirst({
            where: {
              OR: [
                { name: { equals: clean, mode: "insensitive" } },
                { employeeCode: { equals: clean, mode: "insensitive" } },
                { previousEmployeeCode: { equals: clean, mode: "insensitive" } },
              ],
              isActive: true,
            },
          });
          return s?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const clean = name.trim();
          const s = await prisma.staff.findFirst({
            where: {
              name: { contains: clean, mode: "insensitive" },
              isActive: true,
            },
          });
          return s?.id ?? null;
        },
      },
      receivedByStaff: {
        masterLabel: "Staff master",
        lookup: async (name: string) => {
          const clean = name.trim();
          // An exact employee-code hit is unambiguous — resolve it before
          // name matching so duplicate names can't hide a coded pick.
          const byCode = await prisma.staff.findFirst({
            where: {
              OR: [
                { employeeCode: { equals: clean, mode: "insensitive" } },
                { previousEmployeeCode: { equals: clean, mode: "insensitive" } },
              ],
              isActive: true,
            },
            select: { id: true },
          });
          if (byCode) return byCode.id;
          const matches = await prisma.staff.findMany({
            where: {
              name: { equals: clean, mode: "insensitive" },
              isActive: true,
            },
            select: { id: true },
          });
          if (matches.length > 1) {
            throw new Error(
              `receivedByStaff "${clean}" matches ${matches.length} active employees — provide the employee code instead`
            );
          }
          return matches[0]?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const clean = name.trim();
          const matches = await prisma.staff.findMany({
            where: {
              name: { contains: clean, mode: "insensitive" },
              isActive: true,
            },
            select: { id: true },
            take: 2,
          });
          if (matches.length > 1) {
            throw new Error(
              `receivedByStaff "${clean}" matches multiple employees — provide the exact name or employee code`
            );
          }
          return matches[0]?.id ?? null;
        },
      },
      mode: {
        masterLabel: "Mode Master",
        lookup: async (name: string) => {
          const clean = name.trim();
          const m = await prisma.modeMaster.findFirst({
            where: { name: { equals: clean, mode: "insensitive" } },
            select: { id: true, isActive: true },
          });
          if (m && !m.isActive) {
            throw new Error(
              `Mode "${clean}" exists but is inactive — activate it in Mode Master or choose a different mode`
            );
          }
          return m?.id ?? null;
        },
        // No fuzzy matching for modes — a near-miss name must not silently
        // map to a different mode; unknown names fail with a row error.
        fuzzyLookup: async () => null,
      },
      project: {
        masterLabel: "Project master",
        // No autoCreate — projects are only ever created through
        // Masters → Projects. An unmatched or cross-client name fails the row.
        lookup: async (name: string) => {
          const clean = name.trim();
          const matches = await prisma.project.findMany({
            where: {
              OR: [
                { name: { equals: clean, mode: "insensitive" } },
                { abbreviation: { equals: clean, mode: "insensitive" } },
              ],
            },
            select: { id: true },
            take: 2,
          });
          if (matches.length > 1) {
            throw new Error(
              `Project "${clean}" matches multiple projects — provide the project abbreviation`
            );
          }
          return matches[0]?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const clean = name.trim();
          const matches = await prisma.project.findMany({
            where: { name: { contains: clean, mode: "insensitive" } },
            select: { id: true },
            take: 2,
          });
          if (matches.length > 1) {
            throw new Error(
              `Project "${clean}" is ambiguous — provide the exact project name or abbreviation`
            );
          }
          return matches[0]?.id ?? null;
        },
      },
    },
    tadaBills: {
      staff: {
        masterLabel: "Staff master",
        lookup: async (name: string) => {
          const s = await prisma.staff.findFirst({ where: { name, isActive: true } });
          return s?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const s = await prisma.staff.findFirst({
            where: { name: { equals: name, mode: "insensitive" }, isActive: true },
          });
          return s?.id ?? null;
        },
      },
    },
    tasks: {
      assignedTo: {
        masterLabel: "Staff master",
        lookup: async (name: string) => {
          const s = await prisma.staff.findFirst({ where: { name } });
          return s?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const s = await prisma.staff.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
          });
          return s?.id ?? null;
        },
      },
      assignedBy: {
        masterLabel: "User master",
        lookup: async (name: string) => {
          const u = await prisma.user.findFirst({
            where: {
              OR: [
                { name: { equals: name, mode: "insensitive" } },
                { email: { equals: name, mode: "insensitive" } },
              ],
            },
          });
          return u?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const u = await prisma.user.findFirst({
            where: {
              OR: [
                { name: { contains: name, mode: "insensitive" } },
                { email: { contains: name, mode: "insensitive" } },
              ],
            },
          });
          return u?.id ?? null;
        },
        autoCreate: async () => {
          // If assignedBy is not found in User master (since staff are in Staff master, not User master),
          // fallback to the default system admin user so task import never fails.
          const defaultUser = await prisma.user.findFirst();
          return defaultUser?.id ?? null;
        },
      },
      project: {
        masterLabel: "Project master",
        lookup: async (name: string) => {
          const clean = name.trim().replace(/\.+$/, "");
          const p = await prisma.project.findFirst({
            where: {
              OR: [
                { name: { equals: name, mode: "insensitive" } },
                { name: { equals: clean, mode: "insensitive" } },
              ],
            },
          });
          return p?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const clean = name.trim().replace(/\.+$/, "");
          const p = await prisma.project.findFirst({
            where: {
              OR: [
                { name: { equals: name, mode: "insensitive" } },
                { name: { equals: clean, mode: "insensitive" } },
                { name: { contains: clean, mode: "insensitive" } },
                { name: { contains: name, mode: "insensitive" } },
              ],
            },
          });
          return p?.id ?? null;
        },
      },
    },
    staff: {
      region: {
        masterLabel: "Region master",
        lookup: async (name: string) => {
          const r = await prisma.region.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
          });
          return r?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const r = await prisma.region.findFirst({
            where: { name: { contains: name, mode: "insensitive" } },
          });
          return r?.id ?? null;
        },
        autoCreate: async (name: string) => {
          try {
            const r = await prisma.region.create({
              data: { name },
              select: { id: true },
            });
            return r.id;
          } catch {
            // Unique constraint — another row may have already created it
            const existing = await prisma.region.findFirst({
              where: { name: { equals: name, mode: "insensitive" } },
              select: { id: true },
            });
            return existing?.id ?? null;
          }
        },
      },
      reportingManager: {
        masterLabel: "Staff master",
        lookup: async (name: string) => {
          const s = await prisma.staff.findFirst({
            where: { name: { equals: name, mode: "insensitive" }, isActive: true },
          });
          return s?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const s = await prisma.staff.findFirst({
            where: { name: { contains: name, mode: "insensitive" }, isActive: true },
          });
          return s?.id ?? null;
        },
      },
    },
    masters_city: {
      state: {
        masterLabel: "State master",
        lookup: async (name: string) => {
          const s = await prisma.state.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
          return s?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const s = await prisma.state.findFirst({ where: { name: { contains: name, mode: "insensitive" } } });
          return s?.id ?? null;
        },
      },
    },
    masters_assetModel: {
      make: {
        masterLabel: "Asset Make master",
        lookup: async (name: string) => {
          const m = await prisma.assetMake.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
          return m?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const m = await prisma.assetMake.findFirst({ where: { name: { contains: name, mode: "insensitive" } } });
          return m?.id ?? null;
        },
      },
    },
  };

  const resolvers = relationResolvers[module];
  if (!resolvers) return;

  const config = MODULE_EXPORT_CONFIGS[module];
  for (const relField of config.relationFields) {
    const resolver = resolvers[relField];
    if (!resolver) continue;

    const relName = row[relField];
    if (!relName || relName.trim() === "") continue;

    const trimmedName = relName.trim();
    let resolvedId = await resolver.lookup(trimmedName, row);

    if (!resolvedId) {
      resolvedId = await resolver.fuzzyLookup(trimmedName, row);
      if (resolvedId) {
        corrections.push(
          `Row ${rowIndex + 1}: Auto-matched ${relField} "${trimmedName}" (case-insensitive lookup)`
        );
      }
    }

    if (!resolvedId) {
      if (resolver.autoCreate) {
        resolvedId = await resolver.autoCreate(trimmedName, row);
        corrections.push(
          `Row ${rowIndex + 1}: Auto-created ${resolver.masterLabel} "${trimmedName}"`
        );
      } else {
        throw new Error(
          `${resolver.masterLabel} record "${trimmedName}" not found for field "${relField}" — please create it in the ${resolver.masterLabel} first`
        );
      }
    }

    const idField = relField + "Id";
    data[idField] = resolvedId;
    delete data[relField];
  }
}

// ---------- Import deduplication ----------

interface ImportDedupIndex {
  /** Returns the matched natural key if the row already exists, else null */
  match(data: Record<string, unknown>): string | null;
  /** Register a freshly inserted row's keys so later rows in the same file match it */
  add(data: Record<string, unknown>): void;
}

interface DedupSpec {
  model: string;
  select: Record<string, true>;
  /** Keys to index for each existing DB row (may emit several candidate keys) */
  dbKeysOf: (r: Record<string, unknown>) => (string | null)[];
  /** Candidate keys for an incoming row — a hit on ANY means duplicate */
  rowKeysOf: (d: Record<string, unknown>) => (string | null)[];
}

function normalizeDedupValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? "" : value.toISOString();
  }
  const s = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  if (s === "") return "";
  const num = Number(s.replace(/,/g, ""));
  if (!isNaN(num) && /^-?[\d.,]+%?$/.test(s)) return String(num);
  return s;
}

/** Composite key join — returns null if any part is empty */
function joinKey(...parts: unknown[]): string | null {
  const normalized = parts.map(normalizeDedupValue);
  if (normalized.some((p) => p === "")) return null;
  return normalized.join("||");
}

const NAME_MASTER_MODELS: Record<string, string> = {
  masters_region: "region",
  masters_department: "department",
  masters_designation: "designation",
  masters_state: "state",
  masters_city: "city",
  masters_platform: "platform",
  masters_paymentType: "paymentType",
  masters_assetCategory: "assetCategory",
  masters_assetMake: "assetMake",
  masters_orderMaster: "orderMaster",
  masters_workMaster: "workMaster",
  masters_typeMaster: "typeMaster",
  masters_workOrderMaster: "workOrderMaster",
  masters_drawingMaster: "drawingMaster",
  masters_contactMaster: "contactMaster",
  masters_modeMaster: "modeMaster",
};

const REF_MASTER_MODELS: Record<string, string> = {
  masters_dprMaster: "dprMaster",
  masters_tsAaMaster: "tsAaMaster",
};

const INTER_SYSTEM_DEDUP: Record<string, DedupSpec> = {
  fundFlow: {
    model: "fundFlow",
    select: { projectId: true },
    dbKeysOf: (r) => [joinKey(r.projectId)],
    rowKeysOf: (d) => [joinKey(d.projectId)],
  },
  wip: {
    model: "workInProgress",
    select: { projectId: true },
    dbKeysOf: (r) => [joinKey(r.projectId)],
    rowKeysOf: (d) => [joinKey(d.projectId)],
  },
  dueBills: {
    model: "dueBill",
    select: { projectId: true, scheme: true },
    dbKeysOf: (r) => [joinKey(r.projectId, r.scheme)],
    rowKeysOf: (d) => [joinKey(d.projectId, d.scheme)],
  },
  contractors: {
    model: "contractor",
    select: { email: true, name: true },
    dbKeysOf: (r) => [joinKey(r.email), joinKey(r.name)],
    rowKeysOf: (d) => [joinKey(d.email), joinKey(d.name)],
  },
  tenders: {
    model: "tender",
    select: { tenderId: true, name: true },
    dbKeysOf: (r) => [joinKey(r.tenderId), joinKey(r.name)],
    rowKeysOf: (d) => [joinKey(d.tenderId), joinKey(d.name)],
  },
  paymentSchedules: {
    model: "paymentSchedule",
    select: { category: true, paymentType: true, amount: true, dueDate: true },
    dbKeysOf: (r) => {
      const base = joinKey(r.category, r.paymentType);
      if (!base) return [];
      const amt = normalizeDedupValue(r.amount);
      const due = normalizeDedupValue(r.dueDate);
      const keys = [base];
      if (amt) keys.push(`${base}||${amt}`);
      if (due) keys.push(`${base}||${due}`);
      if (amt && due) keys.push(`${base}||${amt}||${due}`);
      return keys;
    },
    rowKeysOf: (d) => {
      const base = joinKey(d.category, d.paymentType);
      if (!base) return [];
      const amt = normalizeDedupValue(d.amount);
      const due = normalizeDedupValue(d.dueDate);
      return [`${base}${amt ? "||" + amt : ""}${due ? "||" + due : ""}`];
    },
  },
  vehicleLogBook: {
    model: "vehicle",
    select: { registrationNumber: true },
    dbKeysOf: (r) => [joinKey(r.registrationNumber)],
    rowKeysOf: (d) => [joinKey(d.registrationNumber)],
  },
  assets: {
    model: "asset",
    select: { itemCode: true, securityCode: true, name: true, make: true, model: true, yearOfPurchase: true },
    dbKeysOf: (r) => [
      joinKey(r.itemCode),
      joinKey(r.securityCode),
      joinKey(r.name, r.make, r.model, r.yearOfPurchase),
    ],
    rowKeysOf: (d) => [
      joinKey(d.itemCode),
      joinKey(d.securityCode),
      joinKey(d.name, d.make, d.model, d.yearOfPurchase),
    ],
  },
  inOutRegister: {
    model: "inOutRegister",
    select: { serialNo: true, documentRefNo: true },
    // serialNo and documentRefNo share one keyspace — either identifies the letter
    dbKeysOf: (r) => [joinKey(r.serialNo), joinKey(r.documentRefNo)],
    rowKeysOf: (d) => [joinKey(d.serialNo), joinKey(d.documentRefNo)],
  },
  tadaBills: {
    model: "tadaClaim",
    select: { staffId: true, fromDate: true, toDate: true },
    dbKeysOf: (r) => [joinKey(r.staffId, r.fromDate, r.toDate)],
    rowKeysOf: (d) => [joinKey(d.staffId, d.fromDate, d.toDate)],
  },
  tasks: {
    model: "task",
    select: { title: true, projectId: true },
    dbKeysOf: (r) => [joinKey(r.title), joinKey(r.title, r.projectId)],
    rowKeysOf: (d) => [
      d.projectId ? joinKey(d.title, d.projectId) : joinKey(d.title),
    ],
  },
  clients: {
    model: "client",
    select: { name: true },
    dbKeysOf: (r) => [joinKey(r.name)],
    rowKeysOf: (d) => [joinKey(d.name)],
  },
  staff: {
    model: "staff",
    select: { employeeCode: true, previousEmployeeCode: true, email: true, name: true, phone: true },
    // A supplied code is also checked against previousEmployeeCode so
    // re-imported legacy-code rows still match the renamed staff record.
    dbKeysOf: (r) => [
      joinKey("c", r.employeeCode),
      joinKey("pc", r.previousEmployeeCode),
      joinKey("e", r.email),
      joinKey("np", r.name, r.phone),
      joinKey("n", r.name),
    ],
    rowKeysOf: (d) => [
      joinKey("c", d.employeeCode),
      joinKey("pc", d.employeeCode),
      joinKey("e", d.email),
      joinKey("np", d.name, d.phone),
      joinKey("n", d.name),
    ],
  },
  masters_assetModel: {
    model: "assetModel",
    select: { name: true, makeId: true },
    // @@unique([name, makeId]): name-only match only applies when no make is set
    dbKeysOf: (r) =>
      r.makeId ? [joinKey(r.name, r.makeId)] : [joinKey(r.name)],
    rowKeysOf: (d) =>
      d.makeId ? [joinKey(d.name, d.makeId)] : [joinKey(d.name)],
  },
};

for (const [mod, model] of Object.entries(NAME_MASTER_MODELS)) {
  INTER_SYSTEM_DEDUP[mod] = {
    model,
    select: { name: true },
    dbKeysOf: (r) => [joinKey(r.name)],
    rowKeysOf: (d) => [joinKey(d.name)],
  };
}

for (const [mod, model] of Object.entries(REF_MASTER_MODELS)) {
  INTER_SYSTEM_DEDUP[mod] = {
    model,
    select: { referenceNumber: true },
    dbKeysOf: (r) => [joinKey(r.referenceNumber)],
    rowKeysOf: (d) => [joinKey(d.referenceNumber)],
  };
}

/** Prefetch existing natural keys for a module into an in-memory Set (one query). */
async function buildImportDedupIndex(module: string): Promise<ImportDedupIndex | null> {
  const spec = INTER_SYSTEM_DEDUP[module];
  if (!spec) return null;
  const delegate = (
    prisma as unknown as Record<
      string,
      { findMany?: (args: unknown) => Promise<Record<string, unknown>[]> }
    >
  )[spec.model];
  if (!delegate || typeof delegate.findMany !== "function") return null;

  const existing = await delegate.findMany({ select: spec.select });
  const keys = new Set<string>();
  for (const row of existing) {
    for (const k of spec.dbKeysOf(row)) if (k) keys.add(k);
  }

  return {
    match(data) {
      for (const k of spec.rowKeysOf(data)) {
        if (k && keys.has(k)) return k;
      }
      return null;
    },
    add(data) {
      for (const k of spec.rowKeysOf(data)) if (k) keys.add(k);
    },
  };
}

// ---------- Intra-sheet (in-file) deduplication ----------

/** Ordered candidate key fields per module; first fully-populated candidate wins. */
const INTRA_FILE_KEY_FIELDS: Record<string, string[][]> = {
  fundFlow: [["project"]],
  dueBills: [["project", "scheme"], ["project"]],
  wip: [["project"]],
  contractors: [["email"], ["name"]],
  tenders: [["tenderId"], ["name"]],
  paymentSchedules: [["category", "paymentType", "amount", "dueDate"]],
  vehicleLogBook: [["registrationNumber"]],
  assets: [["itemCode"], ["securityCode"], ["name", "make", "model", "yearOfPurchase"]],
  inOutRegister: [["documentRefNo"], ["serialNo"], ["direction", "documentDate", "client"]],
  tadaBills: [["staff", "fromDate", "toDate"]],
  tasks: [["title", "project"], ["title"]],
  clients: [["name"]],
  staff: [["email"], ["employeeCode"], ["name", "phone"], ["name"]],
  masters_assetModel: [["name", "make"], ["name"]],
  masters_dprMaster: [["referenceNumber"]],
  masters_tsAaMaster: [["referenceNumber"]],
};

function rawDedupKey(module: string, row: Record<string, unknown>): string {
  const candidates =
    INTRA_FILE_KEY_FIELDS[module] ??
    (module.startsWith("masters_") ? [["name"]] : []);
  for (const fields of candidates) {
    const key = joinKey(...fields.map((f) => row[f]));
    if (key) return `key||${key}`;
  }
  // Fallback: full-row fingerprint — byte-identical rows always collapse
  return `full||${Object.values(row).map(normalizeDedupValue).join("||")}`;
}

/**
 * Deduplicate the parsed file array in-memory. Keeps the first occurrence of
 * each natural key and reports skipped rows into `corrections`.
 */
function dedupeImportRows(
  module: string,
  rawRows: Record<string, unknown>[],
  corrections: string[]
): { rows: Record<string, string>[]; rowNumbers: number[] } {
  const seen = new Map<string, number>();
  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const key = rawDedupKey(module, row);
    const first = seen.get(key);
    if (first !== undefined) {
      corrections.push(`Row ${rowNum}: in-file duplicate — skipped (matches row ${first})`);
      return;
    }
    seen.set(key, rowNum);
    rows.push(row as Record<string, string>);
    rowNumbers.push(rowNum);
  });

  return { rows, rowNumbers };
}

export async function getModuleTemplate(
  module: string
): Promise<ActionResult<{ content: string; filename: string }>> {
  return withPermission("exportImport", "read", async (user) => {
    const config = MODULE_EXPORT_CONFIGS[module];
    if (!config) {
      throw new Error(`Unknown module: ${module}`);
    }

    // Build template with headers + sample row
    const allFields = getTemplateFields(module);
    if (allFields.length === 0) {
      throw new Error(`Template not available for module: ${module}`);
    }

    const sampleValues = getTemplateSampleRow(module);
    const headerLine = allFields.join(",");
    const sampleLine = sampleValues.length === allFields.length
      ? sampleValues.map((v) => v.includes(",") ? `"${v}"` : v).join(",")
      : "";
    const content = sampleLine
      ? `${CSV_BOM}${headerLine}\n${sampleLine}\n`
      : `${CSV_BOM}${headerLine}\n`;

    await audit(user.id, "export", "ExportImport", module, {
      module,
      template: true,
    });

    const filename = getExportFilename(module, "csv").replace(".csv", "-template.csv");
    return { content, filename };
  });
}

function getTemplateFields(module: string): string[] {
  const fieldMap: Record<string, string[]> = {
    contractors: ["name", "contactPerson", "phone", "email", "address", "contractAmount", "agreementDate", "workOrderDate", "tenderId", "detailedOrder", "workName", "workType", "serviceType", "dprReference", "tsAaReference", "scheduleBAmount", "raBillDetails", "finalProgressAmount", "finalProgressProjectExpense"],
    tenders: ["name", "tenderId", "department", "state", "city", "platform", "concernAuthority", "workName", "workType", "serviceType", "tenderDate", "preBidMeetingDate", "preBidMeetingAttended", "preBidMeetingDetails", "biddingLastDate", "dateOfOpening", "tenderFeeAmount", "tenderFeeDate", "tenderFeeMode", "emdAmount", "emdDate", "emdMode", "emdReturnCollectionDate", "l1ContractorName", "l1City", "l1Amount", "l2ContractorName", "l2City", "l2Amount", "l3ContractorName", "l3City", "l3Amount", "priceComparison", "negotiationMeetingDate", "negotiationMeeting", "negotiationMeetingAttended", "status", "remarks"],
    paymentSchedules: ["date", "dueDate", "paymentType", "category", "detail", "amount", "status", "remarks"],
    assets: ["itemCode", "name", "category", "make", "model", "yearOfPurchase", "quantity", "securityCode", "assigneeType", "assignee", "assignedQuantity", "responsiblePerson", "currentHolder", "status", "remarks"],
    fundFlow: ["project", "project_region", "project_client", "project_workOrderDate", "project_timeLimitMonths", "project_totalFee", "project_workType", "project_serviceType", "miscExp", "staffExp", "totalProjectCost", "completedWorkAmt", "proposedDueBillAmount", "feeReceived"],
    dueBills: ["project", "project_region", "project_client", "project_workOrderDate", "project_timeLimitMonths", "project_workType", "project_serviceType", "scheme", "grossAmount", "sgst", "cgst", "billAmount", "chequeAmount", "sd", "itTds", "receivedAmount", "billDate", "receiveDate", "status", "remarks"],
    wip: ["project", "project_region", "project_client", "project_workOrderDate", "project_timeLimitMonths", "project_workType", "project_serviceType", "status", "loiReceiptDate", "agreementDate", "workOrderDate", "timeLimitMonths", "stipulatedCompletionDate", "targetCompletionDate", "hoCoordinator", "roCoordinator", "securityDepositAmount", "securityDepositStatus", "securityDepositReturnDate", "amountOfWorkDone", "finalProgressAmount", "raBill1Amount", "raBill1Date", "raBill1SaecFee", "raBill1ProjectExpense", "raBill2Amount", "raBill2Date", "raBill2SaecFee", "raBill2ProjectExpense", "raBill3Amount", "raBill3Date", "raBill3SaecFee", "raBill3ProjectExpense", "raBill4Amount", "raBill4Date", "raBill4SaecFee", "raBill4ProjectExpense", "completionDate", "remarks"],
    vehicleLogBook: ["registrationNumber", "make", "model", "year", "status", "rcNumber", "rcExpiryDate", "insurancePolicyNumber", "insuranceExpiryDate", "pucNumber", "pucExpiryDate", "tyreWarrantyExpiryDate", "batteryWarrantyExpiryDate"],
    inOutRegister: ["direction", "documentDate", "receivedDate", "documentRefNo", "details", "client", "project", "department", "actionSuggestedStaff", "mode", "inwardType", "receivedByPersonName", "receivedByStaff", "replyDueDate", "parentInwardRefNo"],
    tadaBills: ["staff", "tourPurpose", "fromDate", "toDate", "location", "travelExpense", "accommodationExp", "foodExpense", "localConveyance", "otherExpense", "totalClaimAmount", "advanceAmount", "adjustedAmount", "balanceAmount", "status", "rejectReason"],
    tasks: ["title", "description", "status", "priority", "assignedTo", "assignedBy", "project", "dueDate", "reworkCount"],
    clients: ["name", "abbreviation", "address", "gstNumber", "panNumber", "phone", "website"],
    staff: ["name", "email", "phone", "employeeCode", "designation", "region", "isActive", "reportingManager"],
    masters_region: ["name", "abbreviation"],
    masters_department: ["name"],
    masters_designation: ["name"],
    masters_state: ["name"],
    masters_city: ["name", "state"],
    masters_platform: ["name", "url"],
    masters_paymentType: ["name"],
    masters_assetCategory: ["name"],
    masters_assetMake: ["name"],
    masters_assetModel: ["name", "make"],
    masters_orderMaster: ["name"],
    masters_workMaster: ["name"],
    masters_dprMaster: ["referenceNumber"],
    masters_tsAaMaster: ["referenceNumber"],
    masters_modeMaster: ["name", "isActive"],
  };
  return fieldMap[module] ?? [];
}

function getTemplateSampleRow(module: string): string[] {
  const sampleMap: Record<string, string[]> = {
    contractors: ["ABC Contractors", "Jane Doe", "9876543210", "jane@abc.com", "123 Main St", "500000", "2025-01-15", "2025-02-01", "TND-123", "Order details", "Building Construction", "BUILDING", "CONSULTancy", "DPR-123", "TSAA-123", "0", "RA details", "0", "0"],
    tenders: ["Tender Name", "TND-2025-001", "PWD", "Maharashtra", "Mumbai", "e-Tender", "John Doe", "Road Work", "BUILDING", "CONSULTANCY", "2025-01-10", "2025-01-15", "yes", "Meeting details", "2025-01-25", "2025-01-30", "5000", "2025-01-09", "DD", "25000", "2025-01-09", "DD", "2025-02-15", "XYZ Corp", "Mumbai", "450000", "ABC Corp", "Pune", "460000", "DEF Corp", "Nashik", "470000", "L1 is lowest", "2025-02-05", "Negotiation done", "yes", "SUBMITTED", "Looks good"],
    paymentSchedules: ["2025-01-15", "2025-02-15", "GST Payment", "GST", "Monthly GST", "50000", "PENDING", ""],
    assets: ["AST-001", "Dell Laptop", "Electronics", "Dell", "Latitude 5520", "2025-01-10", "1", "SC-001", "STAFF", "", "1", "", "John Doe", "ASSIGNED", ""],
    fundFlow: ["Project Alpha", "Mumbai Region", "ABC Corp", "2025-01-01", "12", "500000", "BUILDING", "CONSULTANCY", "0", "0", "1000000", "500000", "200000", "50000"],
    dueBills: ["Project Alpha", "Mumbai Region", "ABC Corp", "2025-01-01", "12", "BUILDING", "CONSULTANCY", "GST", "100000", "9000", "9000", "118000", "100000", "5000", "2000", "95000", "2025-01-15", "2025-01-20", "PENDING", ""],
    wip: ["Project Alpha", "Mumbai Region", "ABC Corp", "2025-01-01", "12", "BUILDING", "CONSULTANCY", "NOT_STARTED", "2025-01-10", "2025-01-15", "2025-02-01", "12", "2026-02-01", "2026-08-01", "John Manager", "Jane Coordinator", "50000", "Returned", "2026-03-01", "0", "0", "10000", "2025-03-01", "500", "100", "10000", "2025-04-01", "500", "100", "0", "", "0", "0", "0", "", "0", "0", "", ""],
    vehicleLogBook: ["MH01AB1234", "Toyota", "Innova", "2023", "ACTIVE", "RC123456", "2027-01-01", "INS789", "2026-01-01", "PUC123", "2026-06-01", "2027-01-01", "2025-12-31"],
    inOutRegister: ["INWARD", "2026-05-15", "2026-05-16", "SMC/HEALTH/2026/142", "Project document", "Client Name", "", "Regional Office Rajkot", "John Staff", "By Post", "Head Office", "ACTION_REQUIRED", "", "John Staff", "2026-06-15", ""],
    tadaBills: ["John Doe", "Site Visit", "2025-01-10", "2025-01-12", "Mumbai", "2000", "5000", "1500", "500", "0", "9000", "2000", "7000", "7000", "DRAFT", ""],
    tasks: ["Complete Report", "Finish monthly report", "PENDING", "MEDIUM", "John Doe", "Jane Manager", "Project Alpha", "2025-01-31", "0"],
    clients: ["ABC Corp", "ABC", "123 Business St", "27ABCDE1234F1Z5", "ABCDE1234F", "9876543210", "www.abccorp.com"],
    staff: ["John Doe", "john@company.com", "9876543210", "EMP001", "Engineer", "Mumbai", "Active", "Jane Manager"],
    masters_region: ["Mumbai Region", "MUM"],
    masters_department: ["Engineering"],
    masters_designation: ["Project Manager"],
    masters_state: ["Maharashtra"],
    masters_city: ["Mumbai", "Maharashtra"],
    masters_platform: ["e-Tender", "https://etender.gov.in"],
    masters_paymentType: ["GST"],
    masters_assetCategory: ["Electronics"],
    masters_assetMake: ["Dell"],
    masters_assetModel: ["Latitude 5520", "Dell"],
    masters_orderMaster: ["Order Type A"],
    masters_workMaster: ["Building Work"],
    masters_dprMaster: ["DPR-2025-001"],
    masters_tsAaMaster: ["TSAA-2025-001"],
    masters_modeMaster: ["By Post", "Active"],
  };
  return sampleMap[module] ?? [];
}

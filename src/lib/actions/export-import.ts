"use server";

import { prisma } from "@/lib/prisma";
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
} from "@/lib/export-import";

function parseImportDate(value: string): Date | null {
  if (!value || value.trim() === "") return null;
  const trimmed = value.trim();

  // Try ISO / YYYY-MM-DD
  let d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts1 = trimmed.split(/[\/\-]/);
  if (parts1.length === 3) {
    const day = parseInt(parts1[0], 10);
    const month = parseInt(parts1[1], 10) - 1;
    const year = parseInt(parts1[2], 10);
    d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) return d;
  }

  // Try MM/DD/YYYY or MM-DD-YYYY
  if (parts1.length === 3) {
    const month = parseInt(parts1[0], 10) - 1;
    const day = parseInt(parts1[1], 10);
    const year = parseInt(parts1[2], 10);
    d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) return d;
  }

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
          documents: { select: { path: true } },
          ccStaff: { include: { staff: { select: { name: true } } } },
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

    default:
      throw new Error(`Unknown module: ${module}`);
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
): Promise<ActionResult<{ imported: number; errors: string[] }>> {
  return withPermission("exportImport", "create", async (user) => {
    const parsed = importRequestSchema.parse(input);
    await checkRateLimit(user.id);

    const rows =
      parsed.format === "csv"
        ? parseCsv(parsed.data)
        : parseJson(parsed.data);

    if (rows.length === 0) {
      throw new Error("No data rows found in import file");
    }

    const errors: string[] = [];
    let imported = 0;

    const config = MODULE_EXPORT_CONFIGS[parsed.module];
    if (!config) {
      throw new Error(`Unknown module: ${parsed.module}`);
    }

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const data: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(row)) {
          if (key === "id" || key === "createdAt" || key === "updatedAt") continue;
          if (config.relationFields.includes(key)) continue; // relation fields resolved separately
          if (value === "" || value === null || value === undefined) continue;

          const stringValue = String(value).trim();
          if (stringValue === "") continue;

          if (config.dateFields.includes(key)) {
            const parsedDate = parseImportDate(stringValue);
            if (parsedDate === null) {
              throw new Error(
                `Invalid date "${stringValue}" for ${key}. Use DD/MM/YYYY or YYYY-MM-DD format.`
              );
            }
            data[key] = parsedDate;
          } else if (config.decimalFields.includes(key)) {
            const parsedDecimal = parseFloat(stringValue);
            if (isNaN(parsedDecimal)) {
              throw new Error(`Invalid number "${stringValue}" for ${key}`);
            }
            data[key] = parsedDecimal;
          } else if (config.intFields.includes(key)) {
            const parsedInt = parseInt(stringValue, 10);
            if (isNaN(parsedInt)) {
              throw new Error(`Invalid whole number "${stringValue}" for ${key}`);
            }
            data[key] = parsedInt;
          } else if (config.enumFields[key]) {
            const normalized = stringValue.toUpperCase().replace(/\s+/g, "_");
            const allowed = config.enumFields[key];
            if (!allowed.includes(normalized) && !allowed.includes(stringValue)) {
              throw new Error(
                `Invalid value "${stringValue}" for ${key}. Allowed: ${allowed.join(", ")}`
              );
            }
            data[key] = allowed.includes(normalized) ? normalized : stringValue;
          } else {
            data[key] = stringValue;
          }
        }

        // Resolve relation fields by name lookup
        await resolveRelations(parsed.module, data, row as Record<string, string>);

        switch (parsed.module) {
          case "contractors":
            await prisma.contractor.create({ data: data as never });
            break;
          case "tenders":
            await prisma.tender.create({ data: data as never });
            break;
          case "paymentSchedules":
            await prisma.paymentSchedule.create({ data: data as never });
            break;
          case "assets":
            await prisma.asset.create({ data: data as never });
            break;
          case "fundFlow": {
            await prisma.fundFlow.create({ data: data as never });
            break;
          }
          case "dueBills": {
            await prisma.dueBill.create({ data: data as never });
            break;
          }
          case "wip": {
            await prisma.workInProgress.create({ data: data as never });
            break;
          }
          case "vehicleLogBook": {
            await prisma.vehicle.create({ data: data as never });
            break;
          }
          case "inOutRegister": {
            await prisma.inOutRegister.create({ data: data as never });
            break;
          }
          case "tadaBills": {
            await prisma.tadaClaim.create({ data: data as never });
            break;
          }
          case "tasks": {
            await prisma.task.create({ data: data as never });
            break;
          }
          default:
            errors.push(`Row ${i + 1}: Import not supported for module ${parsed.module}`);
            continue;
        }
        imported++;
      } catch (err) {
        errors.push(
          `Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    await audit(user.id, "import", "ExportImport", parsed.module, {
      module: parsed.module,
      format: parsed.format,
      imported,
      errorCount: errors.length,
    });

    return { imported, errors };
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

async function resolveRelations(
  module: string,
  data: Record<string, unknown>,
  row: Record<string, string>
): Promise<void> {
  // Map relation field names to their lookup logic
  const relationResolvers: Record<string, Record<string, (name: string) => Promise<string | null>>> = {
    fundFlow: {
      project: async (name: string) => {
        const p = await prisma.project.findFirst({ where: { name } });
        return p?.id ?? null;
      },
    },
    dueBills: {
      project: async (name: string) => {
        const p = await prisma.project.findFirst({ where: { name } });
        return p?.id ?? null;
      },
    },
    wip: {
      project: async (name: string) => {
        const p = await prisma.project.findFirst({ where: { name } });
        return p?.id ?? null;
      },
      hoCoordinator: async (name: string) => {
        const s = await prisma.staff.findFirst({ where: { name } });
        return s?.id ?? null;
      },
      roCoordinator: async (name: string) => {
        const s = await prisma.staff.findFirst({ where: { name } });
        return s?.id ?? null;
      },
    },
    inOutRegister: {
      client: async (name: string) => {
        const c = await prisma.client.findFirst({ where: { name } });
        return c?.id ?? null;
      },
      actionSuggestedStaff: async (name: string) => {
        const s = await prisma.staff.findFirst({ where: { name } });
        return s?.id ?? null;
      },
    },
    tadaBills: {
      staff: async (name: string) => {
        const s = await prisma.staff.findFirst({ where: { name } });
        return s?.id ?? null;
      },
    },
    tasks: {
      assignedTo: async (name: string) => {
        const s = await prisma.staff.findFirst({ where: { name } });
        return s?.id ?? null;
      },
      project: async (name: string) => {
        const p = await prisma.project.findFirst({ where: { name } });
        return p?.id ?? null;
      },
    },
  };

  const resolvers = relationResolvers[module];
  if (!resolvers) return;

  const config = MODULE_EXPORT_CONFIGS[module];
  for (const relField of config.relationFields) {
    const resolver = resolvers[relField];
    if (!resolver) continue;

    // Check if the relation name is in the row data
    const relName = row[relField];
    if (!relName || relName.trim() === "") continue;

    const resolvedId = await resolver(relName.trim());
    if (!resolvedId) {
      throw new Error(`Could not find ${relField} "${relName}" — please create it first`);
    }

    // Convert field name to ID field (e.g., "project" -> "projectId")
    const idField = relField + "Id";
    data[idField] = resolvedId;
    delete data[relField];
  }
}

export async function getModuleTemplate(
  module: string
): Promise<ActionResult<{ content: string; filename: string }>> {
  return withPermission("exportImport", "read", async (user) => {
    const config = MODULE_EXPORT_CONFIGS[module];
    if (!config) {
      throw new Error(`Unknown module: ${module}`);
    }

    // Build template headers from an empty row
    const sampleRow: Record<string, string> = {};
    const allFields = getTemplateFields(module);
    for (const field of allFields) {
      sampleRow[field] = "";
    }

    const headers = Object.keys(sampleRow);
    const csvLine = headers.join(",");

    await audit(user.id, "export", "ExportImport", module, {
      module,
      template: true,
    });

    const filename = getExportFilename(module, "csv").replace(".csv", "-template.csv");
    return { content: csvLine, filename };
  });
}

function getTemplateFields(module: string): string[] {
  const fieldMap: Record<string, string[]> = {
    contractors: ["name", "contactPerson", "phone", "email", "address", "contractAmount", "agreementDate", "workOrderDate", "workName", "workType", "serviceType", "scheduleBAmount", "finalProgressAmount"],
    tenders: ["name", "tenderId", "department", "state", "city", "platform", "workName", "workType", "serviceType", "tenderDate", "preBidMeetingDate", "biddingLastDate", "dateOfOpening", "tenderFeeAmount", "tenderFeeDate", "emdAmount", "emdDate", "l1ContractorName", "l1Amount", "status", "remarks"],
    paymentSchedules: ["date", "dueDate", "paymentType", "category", "detail", "amount", "status", "remarks"],
    assets: ["itemCode", "name", "category", "make", "model", "yearOfPurchase", "quantity", "securityCode", "assigneeType", "assignee", "assignedQuantity", "responsiblePerson", "status", "remarks"],
    fundFlow: ["project", "miscExp", "staffExp", "totalProjectCost", "completedWorkAmt", "proposedDueBillAmount", "feeReceived"],
    dueBills: ["project", "scheme", "grossAmount", "sgst", "cgst", "billAmount", "chequeAmount", "sd", "itTds", "receivedAmount", "billDate", "receiveDate", "status", "remarks"],
    wip: ["project", "status", "loiReceiptDate", "agreementDate", "workOrderDate", "timeLimitMonths", "stipulatedCompletionDate", "targetCompletionDate", "hoCoordinator", "roCoordinator", "securityDepositAmount", "amountOfWorkDone", "finalProgressAmount", "completionDate", "remarks"],
    vehicleLogBook: ["registrationNumber", "make", "model", "year", "status", "rcNumber", "rcExpiryDate", "insurancePolicyNumber", "insuranceExpiryDate", "pucExpiryDate"],
    inOutRegister: ["documentDate", "receivedDate", "documentRefNo", "details", "client", "actionSuggestedStaff", "replyDate", "replyRefNo"],
    tadaBills: ["staff", "tourPurpose", "fromDate", "toDate", "location", "travelExpense", "accommodationExp", "foodExpense", "localConveyance", "otherExpense", "totalClaimAmount", "advanceAmount", "status"],
    tasks: ["title", "description", "status", "priority", "assignedTo", "project", "dueDate"],
  };
  return fieldMap[module] ?? [];
}

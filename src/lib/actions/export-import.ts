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
  const latestStaff = await prisma.staff.findFirst({
    where: { employeeCode: { startsWith: "EMP" } },
    orderBy: { employeeCode: "desc" },
  });

  if (!latestStaff || !latestStaff.employeeCode) {
    return "EMP001";
  }

  const match = latestStaff.employeeCode.match(/EMP(\d+)/);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return `EMP${String(num + 1).padStart(3, "0")}`;
  }

  return `EMP${Date.now().toString().slice(-6)}`;
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

    case "clients":
      return prisma.client.findMany({
        include: { contacts: true, _count: { select: { projects: true } } },
      }) as Promise<Record<string, unknown>[]>;

    case "staff":
      return prisma.staff.findMany({
        include: { region: true, reportingManager: true },
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
): Promise<ActionResult<{ imported: number; errors: string[]; corrections: string[] }>> {
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
    const corrections: string[] = [];
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
          if (config.relationFields.includes(key)) continue;
          if (value === "" || value === null || value === undefined) continue;

          const rawValue = String(value).trim();
          if (rawValue === "") continue;

          if (config.dateFields.includes(key)) {
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
              corrections.push(`Row ${i + 1}: Auto-corrected ${key} "${rawValue}" → "${parsedDecimal}"`);
            }
            data[key] = parsedDecimal;
          } else if (config.intFields.includes(key)) {
            const corrected = autoCorrectNumber(rawValue);
            const parsedInt = parseInt(corrected, 10);
            if (isNaN(parsedInt)) {
              throw new Error(`Invalid whole number "${rawValue}" for ${key}`);
            }
            if (corrected !== rawValue) {
              corrections.push(`Row ${i + 1}: Auto-corrected ${key} "${rawValue}" → "${parsedInt}"`);
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
              corrections.push(`Row ${i + 1}: Auto-corrected ${key} "${rawValue}" → "${corrected}"`);
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
        await resolveRelations(parsed.module, data, row as Record<string, string>, corrections, i);

        // Check for duplicate unique fields
        await checkDuplicates(parsed.module, data);

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
          case "assets": {
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
            await prisma.asset.create({ data: data as never });
            break;
          }
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
          case "clients": {
            const { contacts, ...clientData } = data;
            await prisma.client.create({ data: clientData as never });
            break;
          }
          case "staff": {
            if (!data.employeeCode || String(data.employeeCode).trim() === "") {
              data.employeeCode = await generateImportEmployeeCode();
              corrections.push(
                `Row ${i + 1}: Auto-generated Employee Code "${data.employeeCode}"`
              );
            }
            if (data.isActive === undefined) {
              data.isActive = true;
            }
            await prisma.staff.create({ data: data as never });
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
  lookup: (value: string) => Promise<string | null>;
  fuzzyLookup: (value: string) => Promise<string | null>;
  masterLabel: string;
  autoCreate?: (value: string) => Promise<string | null>;
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
    inOutRegister: {
      client: {
        masterLabel: "Client master",
        lookup: async (name: string) => {
          const c = await prisma.client.findFirst({ where: { name } });
          return c?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const c = await prisma.client.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
          });
          return c?.id ?? null;
        },
      },
      actionSuggestedStaff: {
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
          const u = await prisma.user.findFirst({ where: { name } });
          return u?.id ?? null;
        },
        fuzzyLookup: async (name: string) => {
          const u = await prisma.user.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
          });
          return u?.id ?? null;
        },
      },
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
    let resolvedId = await resolver.lookup(trimmedName);

    if (!resolvedId) {
      resolvedId = await resolver.fuzzyLookup(trimmedName);
      if (resolvedId) {
        corrections.push(
          `Row ${rowIndex + 1}: Auto-matched ${relField} "${trimmedName}" (case-insensitive lookup)`
        );
      }
    }

    if (!resolvedId) {
      if (resolver.autoCreate) {
        resolvedId = await resolver.autoCreate(trimmedName);
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

async function checkDuplicates(
  module: string,
  data: Record<string, unknown>
): Promise<void> {
  const checks: Record<string, { field: string; model: keyof typeof prisma }[]> = {
    vehicleLogBook: [{ field: "registrationNumber", model: "vehicle" }],
    assets: [{ field: "itemCode", model: "asset" }],
    contractors: [{ field: "email", model: "contractor" }],
    clients: [{ field: "name", model: "client" }],
    staff: [
      { field: "email", model: "staff" },
      { field: "employeeCode", model: "staff" },
    ],
    masters_region: [{ field: "name", model: "region" }],
    masters_department: [{ field: "name", model: "department" }],
    masters_designation: [{ field: "name", model: "designation" }],
    masters_state: [{ field: "name", model: "state" }],
    masters_city: [{ field: "name", model: "city" }],
    masters_platform: [{ field: "name", model: "platform" }],
    masters_paymentType: [{ field: "name", model: "paymentType" }],
    masters_assetCategory: [{ field: "name", model: "assetCategory" }],
    masters_assetMake: [{ field: "name", model: "assetMake" }],
  };

  const fieldChecks = checks[module];
  if (!fieldChecks) return;

  for (const { field, model } of fieldChecks) {
    const value = data[field];
    if (!value || String(value).trim() === "") continue;

    const existing = await (prisma[model] as unknown as { findFirst: (args: { where: Record<string, unknown> }) => Promise<unknown> }).findFirst({
      where: { [field]: value },
    });

    if (existing) {
      throw new Error(
        `Duplicate ${field} "${value}" — a record with this value already exists`
      );
    }
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
      ? `${headerLine}\n${sampleLine}\n`
      : `${headerLine}\n`;

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
  };
  return fieldMap[module] ?? [];
}

function getTemplateSampleRow(module: string): string[] {
  const sampleMap: Record<string, string[]> = {
    contractors: ["ABC Contractors", "Jane Doe", "9876543210", "jane@abc.com", "123 Main St", "500000", "2025-01-15", "2025-02-01", "Building Construction", "BUILDING", "CONSULTancy", "", ""],
    tenders: ["Tender Name", "TND-2025-001", "PWD", "Maharashtra", "Mumbai", "e-Tender", "Road Work", "BUILDING", "CONSULTANCY", "2025-01-10", "", "2025-01-25", "2025-01-30", "5000", "2025-01-09", "25000", "2025-01-09", "XYZ Corp", "450000", "SUBMITTED", ""],
    paymentSchedules: ["2025-01-15", "2025-02-15", "GST Payment", "GST", "Monthly GST", "50000", "PENDING", ""],
    assets: ["AST-001", "Dell Laptop", "Electronics", "Dell", "Latitude 5520", "2025-01-10", "1", "SC-001", "STAFF", "", "1", "", "ASSIGNED", ""],
    fundFlow: ["Project Alpha", "0", "0", "1000000", "500000", "200000", "50000"],
    dueBills: ["Project Alpha", "GST", "100000", "9000", "9000", "118000", "100000", "5000", "2000", "95000", "2025-01-15", "2025-01-20", "PENDING", ""],
    wip: ["Project Alpha", "NOT_STARTED", "2025-01-10", "2025-01-15", "2025-02-01", "12", "2026-02-01", "2026-08-01", "John Manager", "Jane Coordinator", "50000", "0", "0", "", ""],
    vehicleLogBook: ["MH01AB1234", "Toyota", "Innova", "2023", "ACTIVE", "RC123456", "2027-01-01", "INS789", "2026-01-01", "2026-06-01"],
    inOutRegister: ["2025-01-15", "2025-01-16", "DOC-001", "Project document", "Client Name", "John Staff", "", ""],
    tadaBills: ["John Doe", "Site Visit", "2025-01-10", "2025-01-12", "Mumbai", "2000", "5000", "1500", "500", "0", "9000", "2000", "DRAFT"],
    tasks: ["Complete Report", "Finish monthly report", "PENDING", "MEDIUM", "John Doe", "Project Alpha", "2025-01-31"],
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
  };
  return sampleMap[module] ?? [];
}

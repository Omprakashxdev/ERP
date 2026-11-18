"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  vehicleCreateSchema,
  vehicleUpdateSchema,
  vehicleFilterSchema,
  journeyLogCreateSchemaValidated,
  journeyLogUpdateSchemaValidated,
  journeyLogFilterSchema,
  VehicleCreateInput,
  VehicleUpdateInput,
  VehicleFilterInput,
  JourneyLogCreateInput,
  JourneyLogUpdateInput,
  JourneyLogFilterInput,
} from "@/lib/schemas/vehicle-log-book";
import {
  buildVehicleWhere,
  buildJourneyLogWhere,
} from "@/lib/queries/vehicle-log-book";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

function toDecimal(value: Decimal | null | undefined): Decimal {
  return value ? new Decimal(value.toString()) : new Decimal("0.00");
}

function computeKmTotal(
  startKm: Decimal,
  endKm: Decimal,
  providedTotal?: Decimal | null
): Decimal {
  if (providedTotal) return new Decimal(providedTotal.toString());
  return toDecimal(endKm).minus(toDecimal(startKm));
}

function computeTotalExpenses(row: {
  fuelExpense: Decimal | null;
  serviceExpense: Decimal | null;
  maintenanceExpense: Decimal | null;
  taxExpense: Decimal | null;
}): number {
  return [
    row.fuelExpense,
    row.serviceExpense,
    row.maintenanceExpense,
    row.taxExpense,
  ].reduce((sum, value) => sum + Number(toDecimal(value)), 0);
}

type FuelFillInput = {
  expense?: Decimal | number | null;
  litres?: Decimal | number | null;
  rate?: Decimal | number | null;
  billPath?: string | null;
  odometerPhotoPath?: string | null;
};

// Fold the per-fill rows back into the legacy scalar fields so existing
// reports/exports keep working. Rate is the true blended ₹/L when both
// totals exist, else the average of supplied rates. Missing values stay
// null rather than becoming a fake zero.
function deriveFuelScalars(fills: FuelFillInput[]): {
  fuelExpense: Decimal | null;
  fuelLitre: Decimal | null;
  fuelRate: Decimal | null;
  fuelBillPath: string | null;
  fuelOdometerPhotoPath: string | null;
} {
  let expenseTotal = new Decimal(0);
  let litreTotal = new Decimal(0);
  let hasExpense = false;
  let hasLitre = false;
  const rates: Decimal[] = [];
  for (const f of fills) {
    if (f.expense != null) {
      hasExpense = true;
      expenseTotal = expenseTotal.plus(String(f.expense));
    }
    if (f.litres != null) {
      hasLitre = true;
      litreTotal = litreTotal.plus(String(f.litres));
    }
    if (f.rate != null) rates.push(new Decimal(String(f.rate)));
  }
  let fuelRate: Decimal | null = null;
  if (hasExpense && hasLitre && litreTotal.gt(0)) {
    fuelRate = expenseTotal.div(litreTotal).toDecimalPlaces(2);
  } else if (rates.length) {
    fuelRate = rates
      .reduce((a, b) => a.plus(b), new Decimal(0))
      .div(rates.length)
      .toDecimalPlaces(2);
  }
  return {
    fuelExpense: hasExpense ? expenseTotal.toDecimalPlaces(2) : null,
    fuelLitre: hasLitre ? litreTotal.toDecimalPlaces(2) : null,
    fuelRate,
    fuelBillPath: fills.find((f) => f.billPath)?.billPath ?? null,
    fuelOdometerPhotoPath:
      fills.find((f) => f.odometerPhotoPath)?.odometerPhotoPath ?? null,
  };
}

function isDocumentExpired(value: Date | null): boolean {
  if (!value) return false;
  return new Date(value) < new Date();
}

function computeVehicleFlags(vehicle: {
  rcExpiryDate: Date | null;
  insuranceExpiryDate: Date | null;
  pucExpiryDate: Date | null;
  tyreWarrantyExpiryDate: Date | null;
  batteryWarrantyExpiryDate: Date | null;
}) {
  return {
    isAnyDocumentExpired:
      isDocumentExpired(vehicle.rcExpiryDate) ||
      isDocumentExpired(vehicle.insuranceExpiryDate) ||
      isDocumentExpired(vehicle.pucExpiryDate) ||
      isDocumentExpired(vehicle.tyreWarrantyExpiryDate) ||
      isDocumentExpired(vehicle.batteryWarrantyExpiryDate),
  };
}

function normalizeVehicleDates(
  data: Record<string, unknown>
): Record<string, unknown> {
  const dateFields = [
    "rcExpiryDate",
    "insuranceExpiryDate",
    "pucExpiryDate",
    "tyreWarrantyExpiryDate",
    "batteryWarrantyExpiryDate",
  ];
  for (const key of dateFields) {
    const value = data[key];
    if (!value || value === "" || value === null || value === undefined) {
      data[key] = null;
      continue;
    }
    if (value instanceof Date) continue;
    const str = String(value).trim();
    if (!str) {
      data[key] = null;
      continue;
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) {
      // try dd/mm/yyyy
      const parts = str.split(/[\/\-]/);
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const d2 = new Date(year, month, day);
        if (!isNaN(d2.getTime()) && d2.getDate() === day) {
          data[key] = d2;
          continue;
        }
      }
      throw new Error(`Invalid date value "${str}" for ${key}`);
    }
    data[key] = d;
  }
  return data;
}

export async function createVehicle(
  input: VehicleCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("vehicleLogBook", "create", async (user) => {
    const parsed = vehicleCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const data = normalizeVehicleDates(parsed as Record<string, unknown>);
    const vehicle = await prisma.vehicle.create({ data: data as never });

    await audit(user.id, "create", "Vehicle", vehicle.id, {
      input: await sanitizeForAudit(data),
    });

    revalidatePath("/dashboard/vehicle-log-book");
    return { id: vehicle.id };
  });
}

export async function updateVehicle(
  input: VehicleUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("vehicleLogBook", "update", async (user) => {
    const parsed = vehicleUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const vehicle = await prisma.vehicle.update({ where: { id }, data });

    await audit(user.id, "update", "Vehicle", vehicle.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/vehicle-log-book");
    return { id: vehicle.id };
  });
}

export async function deleteVehicle(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("vehicleLogBook", "delete", async (user) => {
    await checkRateLimit(user.id);

    const vehicle = await prisma.vehicle.delete({ where: { id } });

    await audit(user.id, "delete", "Vehicle", vehicle.id, {});

    revalidatePath("/dashboard/vehicle-log-book");
    return { id: vehicle.id };
  });
}

export async function getVehicles(
  filter?: VehicleFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("vehicleLogBook", "read", async () => {
    const parsed = filter ? vehicleFilterSchema.parse(filter) : undefined;
    const where = buildVehicleWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        include: {
          _count: {
            select: { journeyLogs: true },
          },
        },
        orderBy: { registrationNumber: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.vehicle.count({ where }),
    ]);

    const computedRows = rows.map((vehicle) => ({
      ...vehicle,
      journeyLogCount: vehicle._count.journeyLogs,
      ...computeVehicleFlags(vehicle),
    }));

    return { rows: computedRows, total };
  });
}

export async function getVehicleById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("vehicleLogBook", "read", async () => {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        _count: {
          select: { journeyLogs: true },
        },
      },
    });

    if (!vehicle) return null;

    return {
      ...vehicle,
      journeyLogCount: vehicle._count.journeyLogs,
      ...computeVehicleFlags(vehicle),
    };
  });
}

export async function createJourneyLog(
  input: JourneyLogCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("vehicleLogBook", "create", async (user) => {
    const parsed = journeyLogCreateSchemaValidated.parse(input);
    const { photos, travellerStaffIds, stops, fuelFills, ...data } = parsed;
    await checkRateLimit(user.id);

    const totalKm = computeKmTotal(
      data.startKm,
      data.endKm,
      data.totalKm
    ).toDecimalPlaces(2);

    const journeyLog = await prisma.journeyLog.create({
      data: {
        ...data,
        ...(fuelFills !== undefined ? deriveFuelScalars(fuelFills) : {}),
        totalKm,
        photos: photos
          ? { create: photos.map((path) => ({ path })) }
          : undefined,
        travellers: travellerStaffIds?.length
          ? { create: travellerStaffIds.map((staffId) => ({ staffId })) }
          : undefined,
        stops: stops?.length
          ? {
              create: stops.map((s, i) => ({
                location: s.location,
                stopOrder: i + 1,
              })),
            }
          : undefined,
        fuelFills: fuelFills?.length
          ? {
              create: fuelFills.map((f) => ({
                expense: f.expense ?? null,
                litres: f.litres ?? null,
                rate: f.rate ?? null,
                billPath: f.billPath ?? null,
                odometerPhotoPath: f.odometerPhotoPath ?? null,
              })),
            }
          : undefined,
      },
    });

    await audit(user.id, "create", "JourneyLog", journeyLog.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/vehicle-log-book");
    return { id: journeyLog.id };
  });
}

export async function updateJourneyLog(
  input: JourneyLogUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("vehicleLogBook", "update", async (user) => {
    const parsed = journeyLogUpdateSchemaValidated.parse(input);
    const { id, photos, travellerStaffIds, stops, fuelFills, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.journeyLog.findUnique({
      where: { id },
      include: { photos: true },
    });
    if (!existing) throw new Error("Journey log not found");

    const startKm = data.startKm ?? existing.startKm;
    const endKm = data.endKm ?? existing.endKm;
    if (startKm != null && endKm != null && Number(endKm) < Number(startKm)) {
      throw new Error("End KM cannot be less than Start KM");
    }
    const providedTotal = data.totalKm;
    const totalKm = computeKmTotal(startKm, endKm, providedTotal).toDecimalPlaces(2);

    await prisma.journeyLogPhoto.deleteMany({
      where: { journeyLogId: id },
    });

    // Stops: replace the whole ordered list when the client sends one —
    // absent `stops` leaves existing rows untouched.
    if (stops !== undefined) {
      await prisma.journeyStop.deleteMany({ where: { journeyLogId: id } });
      if (stops.length) {
        await prisma.journeyStop.createMany({
          data: stops.map((s, i) => ({
            journeyLogId: id,
            location: s.location,
            stopOrder: i + 1,
          })),
        });
      }
    }

    // Fuel fills: same replace-all semantics as stops — absent `fuelFills`
    // leaves existing rows (and scalar totals) untouched.
    if (fuelFills !== undefined) {
      await prisma.journeyFuel.deleteMany({ where: { journeyLogId: id } });
      if (fuelFills.length) {
        await prisma.journeyFuel.createMany({
          data: fuelFills.map((f) => ({
            journeyLogId: id,
            expense: f.expense ?? null,
            litres: f.litres ?? null,
            rate: f.rate ?? null,
            billPath: f.billPath ?? null,
            odometerPhotoPath: f.odometerPhotoPath ?? null,
          })),
        });
      }
    }

    // Traveller staff ids are a join relation — sync only the diff so
    // existing traveller rows are preserved unless explicitly changed.
    if (travellerStaffIds !== undefined) {
      const current = await prisma.journeyLogTraveller.findMany({
        where: { journeyLogId: id },
        select: { staffId: true },
      });
      const currentIds = new Set(current.map((c) => c.staffId));
      const nextIds = new Set(travellerStaffIds);
      const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
      const toAdd = [...nextIds].filter((id) => !currentIds.has(id));
      if (toRemove.length) {
        await prisma.journeyLogTraveller.deleteMany({
          where: { journeyLogId: id, staffId: { in: toRemove } },
        });
      }
      if (toAdd.length) {
        await prisma.journeyLogTraveller.createMany({
          data: toAdd.map((staffId) => ({ journeyLogId: id, staffId })),
        });
      }
    }

    const journeyLog = await prisma.journeyLog.update({
      where: { id },
      data: {
        ...data,
        ...(fuelFills !== undefined ? deriveFuelScalars(fuelFills) : {}),
        totalKm,
        photos: photos
          ? { create: photos.map((path) => ({ path })) }
          : undefined,
      },
    });

    await audit(user.id, "update", "JourneyLog", journeyLog.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/vehicle-log-book");
    return { id: journeyLog.id };
  });
}

export async function deleteJourneyLog(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("vehicleLogBook", "delete", async (user) => {
    await checkRateLimit(user.id);

    const journeyLog = await prisma.journeyLog.delete({ where: { id } });

    await audit(user.id, "delete", "JourneyLog", journeyLog.id, {});

    revalidatePath("/dashboard/vehicle-log-book");
    return { id: journeyLog.id };
  });
}

export async function getJourneyLogs(
  filter?: JourneyLogFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("vehicleLogBook", "read", async () => {
    const parsed = filter ? journeyLogFilterSchema.parse(filter) : undefined;
    const where = buildJourneyLogWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.journeyLog.findMany({
        where,
        include: {
          vehicle: true,
          photos: true,
          travellers: { include: { staff: { select: { id: true, name: true } } } },
          stops: { orderBy: { stopOrder: "asc" } },
          fuelFills: { orderBy: { createdAt: "asc" } },
          approvedBy: {
            select: { id: true, name: true, designation: true },
          },
        },
        orderBy: { journeyDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.journeyLog.count({ where }),
    ]);

    const computedRows = rows.map((row) => ({
      ...row,
      totalExpenses: computeTotalExpenses(row),
    }));

    return { rows: computedRows, total };
  });
}

export async function getJourneyLogById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("vehicleLogBook", "read", async () => {
    const journeyLog = await prisma.journeyLog.findUnique({
      where: { id },
      include: {
        vehicle: true,
        photos: true,
        travellers: { include: { staff: { select: { id: true, name: true } } } },
        stops: { orderBy: { stopOrder: "asc" } },
        fuelFills: { orderBy: { createdAt: "asc" } },
        approvedBy: {
          select: { id: true, name: true, designation: true },
        },
      },
    });

    if (!journeyLog) return null;

    return {
      ...journeyLog,
      totalExpenses: computeTotalExpenses(journeyLog),
    };
  });
}

export async function approveJourneyLog(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("vehicleLogBook", "update", async (user) => {
    await checkRateLimit(user.id);

    const journeyLog = await prisma.journeyLog.update({
      where: { id },
      data: { approvalStatus: "APPROVED", rejectedReason: null },
    });

    await audit(user.id, "approve", "JourneyLog", journeyLog.id, {});

    revalidatePath("/dashboard/vehicle-log-book");
    return { id: journeyLog.id };
  });
}

export async function rejectJourneyLog(
  id: string,
  reason: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("vehicleLogBook", "update", async (user) => {
    await checkRateLimit(user.id);

    const journeyLog = await prisma.journeyLog.update({
      where: { id },
      data: { approvalStatus: "REJECTED", rejectedReason: reason },
    });

    await audit(user.id, "reject", "JourneyLog", journeyLog.id, {
      reason,
    });

    revalidatePath("/dashboard/vehicle-log-book");
    return { id: journeyLog.id };
  });
}

/** Active project names for the journey purpose picker (WIP list). */
export async function getProjectNameSuggestions(): Promise<ActionResult<string[]>> {
  return withPermission("vehicleLogBook", "read", async () => {
    const rows = await prisma.project.findMany({
      where: { status: "ACTIVE" },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 200,
    });
    return rows.map((r) => r.name);
  });
}

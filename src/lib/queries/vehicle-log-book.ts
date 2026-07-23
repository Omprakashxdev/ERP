import {
  VehicleFilterInput,
  JourneyLogFilterInput,
} from "@/lib/schemas/vehicle-log-book";

export function buildVehicleWhere(filter?: VehicleFilterInput) {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { registrationNumber: { contains: term, mode: "insensitive" } },
        { make: { contains: term, mode: "insensitive" } },
        { model: { contains: term, mode: "insensitive" } },
        { rcNumber: { contains: term, mode: "insensitive" } },
        { insurancePolicyNumber: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (filter?.status) and.push({ status: filter.status });

  if (and.length > 0) where.AND = and;
  return where;
}

export function buildJourneyLogWhere(filter?: JourneyLogFilterInput) {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { fromLocation: { contains: term, mode: "insensitive" } },
        { toLocation: { contains: term, mode: "insensitive" } },
        { driverName: { contains: term, mode: "insensitive" } },
        { purpose: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (filter?.vehicleId) and.push({ vehicleId: filter.vehicleId });
  if (filter?.approvalStatus) and.push({ approvalStatus: filter.approvalStatus });

  if (filter?.journeyDateFrom) {
    and.push({ journeyDate: { gte: filter.journeyDateFrom } });
  }
  if (filter?.journeyDateTo) {
    const to = new Date(filter.journeyDateTo);
    to.setDate(to.getDate() + 1);
    and.push({ journeyDate: { lt: to } });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

import { ProjectStatus } from "@prisma/client";
import { FundFlowFilterInput } from "@/lib/schemas/fund-flow";

export function buildFundFlowWhere(filter?: FundFlowFilterInput) {
  const where: Record<string, unknown> = {};

  if (!filter) return where;

  if (filter.regionId) {
    where.regionId = filter.regionId;
  }
  if (filter.clientId) {
    where.clientId = filter.clientId;
  }
  if (filter.status) {
    where.status = filter.status as ProjectStatus;
  }
  if (filter.workType) {
    where.workType = filter.workType;
  }
  if (filter.serviceType) {
    where.serviceType = filter.serviceType;
  }
  if (filter.workOrderDateFrom || filter.workOrderDateTo) {
    where.workOrderDate = {};
    if (filter.workOrderDateFrom) {
      (where.workOrderDate as Record<string, Date>).gte = filter.workOrderDateFrom;
    }
    if (filter.workOrderDateTo) {
      (where.workOrderDate as Record<string, Date>).lte = filter.workOrderDateTo;
    }
  }
  if (filter.search) {
    where.name = { contains: filter.search, mode: "insensitive" as const };
  }

  return where;
}

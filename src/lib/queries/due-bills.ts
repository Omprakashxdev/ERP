import { DueBillStatus } from "@prisma/client";
import { DueBillFilterInput } from "@/lib/schemas/due-bill";

export function buildDueBillsWhere(filter?: DueBillFilterInput) {
  const where: Record<string, unknown> = {};

  if (!filter) return where;

  if (filter.projectId) {
    where.projectId = filter.projectId;
  }
  if (filter.status) {
    where.status = filter.status as DueBillStatus;
  }
  if (filter.scheme) {
    where.scheme = { contains: filter.scheme, mode: "insensitive" as const };
  }
  if (filter.billDateFrom || filter.billDateTo) {
    where.billDate = {};
    if (filter.billDateFrom) {
      (where.billDate as Record<string, Date>).gte = filter.billDateFrom;
    }
    if (filter.billDateTo) {
      (where.billDate as Record<string, Date>).lte = filter.billDateTo;
    }
  }

  const projectWhere: Record<string, unknown> = {};
  if (filter.clientId) {
    projectWhere.clientId = filter.clientId;
  }
  if (filter.regionId) {
    projectWhere.regionId = filter.regionId;
  }

  if (filter.search) {
    const search = filter.search;
    projectWhere.OR = [
      { name: { contains: search, mode: "insensitive" as const } },
      { abbreviation: { contains: search, mode: "insensitive" as const } },
    ];
  }

  if (Object.keys(projectWhere).length > 0) {
    where.project = projectWhere;
  }

  return where;
}

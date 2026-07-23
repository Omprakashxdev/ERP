import { WipStatus } from "@prisma/client";
import { WipFilterInput } from "@/lib/schemas/wip";

export function buildWipWhere(filter?: WipFilterInput) {
  const where: Record<string, unknown> = {};

  if (!filter) return where;

  if (filter.projectId) {
    where.projectId = filter.projectId;
  }
  if (filter.status) {
    where.status = filter.status as WipStatus;
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

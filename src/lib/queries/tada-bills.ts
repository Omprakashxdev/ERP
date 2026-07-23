import { TadaClaimFilterInput } from "@/lib/schemas/tada-bills";

export function buildTadaClaimWhere(filter?: TadaClaimFilterInput) {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { tourPurpose: { contains: term, mode: "insensitive" } },
        { location: { contains: term, mode: "insensitive" } },
        { staff: { name: { contains: term, mode: "insensitive" } } },
      ],
    });
  }

  if (filter?.staffId) and.push({ staffId: filter.staffId });
  if (filter?.status) and.push({ status: filter.status });

  if (filter?.dateFrom) and.push({ fromDate: { gte: filter.dateFrom } });
  if (filter?.dateTo) {
    const to = new Date(filter.dateTo);
    to.setDate(to.getDate() + 1);
    and.push({ toDate: { lt: to } });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

import { TenderFilterInput } from "@/lib/schemas/tender";

export function buildTenderWhere(
  filter?: TenderFilterInput
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { tenderId: { contains: term, mode: "insensitive" } },
        { department: { contains: term, mode: "insensitive" } },
        { workName: { contains: term, mode: "insensitive" } },
        { platform: { contains: term, mode: "insensitive" } },
        { city: { contains: term, mode: "insensitive" } },
        { state: { contains: term, mode: "insensitive" } },
        { remarks: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (filter?.status) {
    and.push({ status: filter.status });
  }

  if (filter?.workType) {
    and.push({ workType: filter.workType });
  }

  if (filter?.serviceType) {
    and.push({ serviceType: filter.serviceType });
  }

  if (filter?.city?.trim()) {
    and.push({ city: { contains: filter.city.trim(), mode: "insensitive" } });
  }

  if (filter?.state?.trim()) {
    and.push({ state: { contains: filter.state.trim(), mode: "insensitive" } });
  }

  if (filter?.platform?.trim()) {
    and.push({
      platform: { contains: filter.platform.trim(), mode: "insensitive" },
    });
  }

  if (filter?.fromDate) {
    and.push({ tenderDate: { gte: filter.fromDate } });
  }

  if (filter?.toDate) {
    and.push({ tenderDate: { lte: filter.toDate } });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
}

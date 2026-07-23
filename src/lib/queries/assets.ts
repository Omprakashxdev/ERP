import { AssetFilterInput } from "@/lib/schemas/asset";

export function buildAssetWhere(filter?: AssetFilterInput) {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { itemCode: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
        { category: { contains: term, mode: "insensitive" } },
        { make: { contains: term, mode: "insensitive" } },
        { model: { contains: term, mode: "insensitive" } },
        { securityCode: { contains: term, mode: "insensitive" } },
        { assignee: { contains: term, mode: "insensitive" } },
        { responsiblePerson: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (filter?.category)
    and.push({ category: { contains: filter.category, mode: "insensitive" } });
  if (filter?.status) and.push({ status: filter.status });
  if (filter?.yearOfPurchase) and.push({ yearOfPurchase: filter.yearOfPurchase });

  if (and.length > 0) where.AND = and;
  return where;
}

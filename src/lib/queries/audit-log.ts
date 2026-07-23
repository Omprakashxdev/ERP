import { AuditLogFilterInput } from "@/lib/schemas/notifications";

export function buildAuditLogWhere(filter?: AuditLogFilterInput) {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { action: { contains: term, mode: "insensitive" } },
        { entity: { contains: term, mode: "insensitive" } },
        { entityId: { contains: term, mode: "insensitive" } },
        { user: { name: { contains: term, mode: "insensitive" } } },
        { user: { email: { contains: term, mode: "insensitive" } } },
      ],
    });
  }

  if (filter?.userId) and.push({ userId: filter.userId });
  if (filter?.action) and.push({ action: filter.action });
  if (filter?.entity) and.push({ entity: filter.entity });

  if (filter?.dateFrom) {
    and.push({ createdAt: { gte: filter.dateFrom } });
  }
  if (filter?.dateTo) {
    const to = new Date(filter.dateTo);
    to.setDate(to.getDate() + 1);
    and.push({ createdAt: { lt: to } });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

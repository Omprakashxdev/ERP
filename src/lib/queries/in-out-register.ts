import { InOutRegisterFilterInput } from "@/lib/schemas/in-out-register";

function getAgeThresholdDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function buildInOutRegisterWhere(filter?: InOutRegisterFilterInput) {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { documentRefNo: { contains: term, mode: "insensitive" } },
        { details: { contains: term, mode: "insensitive" } },
        { client: { name: { contains: term, mode: "insensitive" } } },
      ],
    });
  }

  if (filter?.direction) and.push({ direction: filter.direction });
  if (filter?.clientId) and.push({ clientId: filter.clientId });
  if (filter?.actionSuggestedStaffId)
    and.push({ actionSuggestedStaffId: filter.actionSuggestedStaffId });

  if (filter?.ccStaffId) {
    and.push({
      ccStaff: {
        some: { staffId: filter.ccStaffId },
      },
    });
  }

  if (filter?.hasReply === "true") {
    and.push({ replyDate: { not: null } });
  } else if (filter?.hasReply === "false") {
    and.push({ replyDate: null });
  }

  if (filter?.receivedDateFrom) {
    and.push({ receivedDate: { gte: filter.receivedDateFrom } });
  }
  if (filter?.receivedDateTo) {
    const to = new Date(filter.receivedDateTo);
    to.setDate(to.getDate() + 1);
    and.push({ receivedDate: { lt: to } });
  }

  if (filter?.ageDue) {
    const days = Number(filter.ageDue);
    and.push({ receivedDate: { lte: getAgeThresholdDate(days) } });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

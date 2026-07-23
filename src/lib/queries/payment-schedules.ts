import { PaymentScheduleFilterInput } from "@/lib/schemas/payment-schedule";

export function buildPaymentScheduleWhere(
  filter?: PaymentScheduleFilterInput
) {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { paymentType: { contains: term, mode: "insensitive" } },
        { detail: { contains: term, mode: "insensitive" } },
        { remarks: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (filter?.category) and.push({ category: filter.category });
  if (filter?.status) and.push({ status: filter.status });

  if (filter?.fromDate) {
    and.push({ date: { gte: filter.fromDate } });
  }
  if (filter?.toDate) {
    const to = new Date(filter.toDate);
    to.setDate(to.getDate() + 1);
    and.push({ date: { lt: to } });
  }

  if (filter?.dueDateFrom) {
    and.push({ dueDate: { gte: filter.dueDateFrom } });
  }
  if (filter?.dueDateTo) {
    const dueTo = new Date(filter.dueDateTo);
    dueTo.setDate(dueTo.getDate() + 1);
    and.push({ dueDate: { lt: dueTo } });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

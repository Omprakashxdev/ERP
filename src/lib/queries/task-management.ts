import { TaskFilterInput } from "@/lib/schemas/task-management";

export function buildTaskWhere(filter?: TaskFilterInput) {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (filter?.search?.trim()) {
    const term = filter.search.trim();
    and.push({
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (filter?.assignedToId) and.push({ assignedToId: filter.assignedToId });
  if (filter?.status) and.push({ status: filter.status });
  if (filter?.priority) and.push({ priority: filter.priority });
  if (filter?.projectId) and.push({ projectId: filter.projectId });

  if (filter?.overdue === "true") {
    and.push({
      dueDate: { lt: new Date() },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

import { prisma } from "@/lib/prisma";

interface TaskAccessFields {
  assignedToId: string;
  assignedById: string | null;
  reviewerId: string | null;
}

/**
 * Record-level task authorization for attachment upload/download and
 * other per-task access. A general module read alone is NOT enough —
 * the user must be the assignee, the reviewer, the assigner, or hold
 * taskManagement:update (ADMIN/MANAGER).
 *
 * Staff↔User bridging is by email (the registration flow creates both
 * records with the same address). Null/missing links fail closed.
 */
export async function canAccessTask(
  user: { id: string; role?: string | null },
  task: TaskAccessFields
): Promise<boolean> {
  const role = String(user.role ?? "");
  if (role === "ADMIN" || role === "MANAGER") return true;
  if (task.assignedById === user.id) return true;

  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  if (!u?.email) return false;
  const staff = await prisma.staff.findFirst({
    where: { email: { equals: u.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!staff) return false;
  return task.assignedToId === staff.id || task.reviewerId === staff.id;
}

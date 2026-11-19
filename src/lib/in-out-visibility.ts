import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermissionWithOverrides } from "@/lib/authz";

export interface InOutVisibilityUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role: Role;
}

// Full-table access is reserved for admins or users explicitly granted
// the "admin" action on inOutRegister via Edit User → Module Access.
export async function hasFullInOutAccess(
  user: InOutVisibilityUser
): Promise<boolean> {
  if (user.role === Role.ADMIN) return true;
  return hasPermissionWithOverrides(
    user.role,
    "inOutRegister",
    "admin",
    user.id
  );
}

// Login Users and staff-master rows are not linked by a FK — resolve by
// exact email first, then exact display name, both case-insensitive.
export async function resolveStaffForUser(user: InOutVisibilityUser) {
  const email = user.email?.trim();
  if (email) {
    const byEmail = await prisma.staff.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, isActive: true },
    });
    if (byEmail) return byEmail;
  }
  const name = user.name?.trim();
  if (name) {
    return prisma.staff.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, isActive: true },
    });
  }
  return null;
}

// Prisma `where` fragment limiting a non-privileged user to the register
// rows they created or are named on. Returns {} for full-access users.
export async function buildInOutVisibilityWhere(
  user: InOutVisibilityUser
): Promise<Record<string, unknown>> {
  if (await hasFullInOutAccess(user)) return {};

  const staff = await resolveStaffForUser(user);
  const or: Record<string, unknown>[] = [{ createdByUserId: user.id }];
  if (staff) {
    or.push(
      { receivedByStaffId: staff.id },
      { actionSuggestedStaffId: staff.id },
      { ccStaff: { some: { staffId: staff.id } } },
      { receivedByPersonName: { equals: staff.name, mode: "insensitive" } }
    );
  }
  return { OR: or };
}

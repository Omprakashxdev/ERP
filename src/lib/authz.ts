import { auth } from "@/lib/auth";
import { Role } from "@/types/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user;
}

export async function requireRole(allowedRoles: Role[]) {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    redirect("/unauthorized");
  }
  return user;
}

export const roleRank: Record<Role, number> = {
  [Role.STAFF]: 1,
  [Role.AUDITOR]: 2,
  [Role.MANAGER]: 3,
  [Role.ADMIN]: 4,
};

export function isAtLeastRole(role: Role, minimumRole: Role): boolean {
  return roleRank[role] >= roleRank[minimumRole];
}

const permissionMatrix: Record<
  string,
  Partial<Record<Role, string[]>>
> = {
  fundFlow: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  dueBills: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  wip: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  contractors: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  tenders: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  paymentSchedules: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  vehicleLogBook: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  assets: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  inOutRegister: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  users: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["read"],
    [Role.AUDITOR]: ["read"],
  },
  reports: {
    [Role.ADMIN]: ["read", "admin"],
    [Role.MANAGER]: ["read"],
    [Role.AUDITOR]: ["read"],
    [Role.STAFF]: ["read"],
  },
  exportImport: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  notifications: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["read", "update"],
    [Role.STAFF]: ["read"],
    [Role.AUDITOR]: ["read"],
  },
  auditLog: {
    [Role.ADMIN]: ["read", "admin"],
    [Role.AUDITOR]: ["read"],
  },
  userManagement: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
  },
  tadaBills: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["create", "read"],
    [Role.AUDITOR]: ["create", "read"],
  },
  taskManagement: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read", "create"],
    [Role.AUDITOR]: ["read"],
  },
  clientManagement: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.AUDITOR]: ["read"],
  },
  staffManagement: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.AUDITOR]: ["read"],
  },
  projectManagement: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["create", "read", "update"],
    [Role.STAFF]: ["read"],
    [Role.AUDITOR]: ["read"],
  },
  progressApp: {
    [Role.ADMIN]: ["create", "read", "update", "delete", "admin"],
    [Role.MANAGER]: ["read"],
    [Role.STAFF]: ["read"],
    [Role.AUDITOR]: ["read"],
  },
};

export function hasPermission(
  role: Role,
  resource: string,
  action: string
): boolean {
  if (role === Role.ADMIN) {
    return true;
  }

  const actions = permissionMatrix[resource]?.[role];
  return actions?.includes(action) ?? false;
}

const permissionCache: Record<string, Record<string, string[]>> = {};
const userPermissionCache: Record<string, Record<string, string[]>> = {};
let cacheTimestamp = 0;
const CACHE_TTL = 30_000;

export function invalidatePermissionCache() {
  cacheTimestamp = 0;
}

async function ensurePermissionCaches() {
  const now = Date.now();
  if (now - cacheTimestamp <= CACHE_TTL) return;
  try {
    const [overrides, userOverrides] = await Promise.all([
      prisma.rolePermission.findMany(),
      prisma.userModulePermission.findMany(),
    ]);
    for (const key of Object.keys(permissionCache)) {
      delete permissionCache[key];
    }
    for (const key of Object.keys(userPermissionCache)) {
      delete userPermissionCache[key];
    }
    for (const o of overrides) {
      if (!permissionCache[o.resource]) permissionCache[o.resource] = {};
      permissionCache[o.resource][o.role] = o.allowedActions;
    }
    for (const o of userOverrides) {
      if (!userPermissionCache[o.userId]) userPermissionCache[o.userId] = {};
      userPermissionCache[o.userId][o.resource] = o.allowedActions;
    }
    cacheTimestamp = now;
  } catch {
    // DB not available (or migration not applied yet), fall back to hardcoded
  }
}

export async function hasPermissionWithOverrides(
  role: Role,
  resource: string,
  action: string,
  userId?: string
): Promise<boolean> {
  if (role === Role.ADMIN) {
    return true;
  }

  await ensurePermissionCaches();

  if (userId) {
    const userActions = userPermissionCache[userId]?.[resource];
    if (userActions !== undefined) {
      return userActions.includes(action);
    }
  }

  const overrideActions = permissionCache[resource]?.[role];
  if (overrideActions !== undefined) {
    return overrideActions.includes(action);
  }

  const actions = permissionMatrix[resource]?.[role];
  return actions?.includes(action) ?? false;
}

// Effective per-resource actions for a user — user override > role override > matrix.
// Used by the dashboard layout to filter sidebar navigation.
export async function getUserModuleAccess(
  userId: string,
  role: Role
): Promise<Record<string, string[]>> {
  await ensurePermissionCaches();

  const resources = new Set<string>(Object.keys(permissionMatrix));
  for (const r of Object.keys(permissionCache)) resources.add(r);
  const userRows = userPermissionCache[userId] ?? {};
  for (const r of Object.keys(userRows)) resources.add(r);

  const result: Record<string, string[]> = {};
  for (const resource of resources) {
    if (role === Role.ADMIN) {
      result[resource] =
        permissionMatrix[resource]?.[Role.ADMIN] ??
        ["create", "read", "update", "delete", "admin"];
      continue;
    }
    if (userRows[resource] !== undefined) {
      result[resource] = userRows[resource];
      continue;
    }
    const roleActions = permissionCache[resource]?.[role];
    result[resource] = roleActions ?? permissionMatrix[resource]?.[role] ?? [];
  }
  return result;
}

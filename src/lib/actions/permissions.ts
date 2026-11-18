"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, invalidatePermissionCache } from "@/lib/authz";
import { Role } from "@prisma/client";
import { audit } from "./wrapper";
import { revalidatePath } from "next/cache";

export interface PermissionData {
  resource: string;
  role: string;
  allowedActions: string[];
}

const defaultPermissions: Record<string, Record<string, string[]>> = {
  fundFlow: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  dueBills: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  wip: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  contractors: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  tenders: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  paymentSchedules: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  vehicleLogBook: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  assets: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  inOutRegister: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  tadaBills: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["create", "read"], AUDITOR: ["create", "read"] },
  taskManagement: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["create", "read", "update"], STAFF: ["read", "create"], AUDITOR: ["read"] },
  reports: { ADMIN: ["read", "admin"], MANAGER: ["read"], STAFF: ["read"], AUDITOR: ["read"] },
  exportImport: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["read", "create"], AUDITOR: ["read"] },
  notifications: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["read", "update"], STAFF: ["read"], AUDITOR: ["read"] },
  auditLog: { ADMIN: ["read", "admin"], AUDITOR: ["read"] },
  userManagement: { ADMIN: ["create", "read", "update", "delete", "admin"] },
  progressApp: { ADMIN: ["create", "read", "update", "delete", "admin"], MANAGER: ["read"], STAFF: ["read"], AUDITOR: ["read"] },
};

export async function getAllPermissions(): Promise<{
  success: boolean;
  data?: Record<string, Record<string, string[]>>;
  error?: string;
}> {
  try {
    const user = await requireAuth();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Only admins can view permissions." };
    }

    const overrides = await prisma.rolePermission.findMany();

    const result: Record<string, Record<string, string[]>> = {};
    for (const mod of Object.keys(defaultPermissions)) {
      result[mod] = {};
      for (const role of ["ADMIN", "MANAGER", "STAFF", "AUDITOR"]) {
        const override = overrides.find(
          (o) => o.resource === mod && o.role === role
        );
        if (override) {
          result[mod][role] = override.allowedActions;
        } else {
          result[mod][role] = defaultPermissions[mod][role] ?? [];
        }
      }
    }

    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function updatePermission(
  resource: string,
  role: string,
  allowedActions: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Only admins can modify permissions." };
    }

    if (role === "ADMIN") {
      return { success: false, error: "Admin permissions cannot be modified." };
    }

    await prisma.rolePermission.upsert({
      where: {
        role_resource: { role: role as Role, resource },
      },
      create: {
        role: role as Role,
        resource,
        allowedActions,
      },
      update: {
        allowedActions,
      },
    });

    await audit(user.id, "update", "RolePermission", `${role}:${resource}`, {
      role,
      resource,
      allowedActions,
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function getAiAllowedRoles(): Promise<{
  success: boolean;
  data?: string[];
  error?: string;
}> {
  try {
    await requireAuth();

    const setting = await prisma.systemSetting.findUnique({
      where: { key: "ai_allowed_roles" },
    });

    if (!setting) {
      return { success: true, data: ["ADMIN", "MANAGER", "STAFF", "AUDITOR"] };
    }

    return { success: true, data: setting.value.split(",") };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function updateAiAllowedRoles(
  roles: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Only admins can modify AI access." };
    }

    await prisma.systemSetting.upsert({
      where: { key: "ai_allowed_roles" },
      create: {
        key: "ai_allowed_roles",
        value: roles.join(","),
      },
      update: {
        value: roles.join(","),
      },
    });

    await audit(user.id, "update", "SystemSetting", "ai_allowed_roles", {
      roles,
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

const moduleLabels: Record<string, string> = {
  fundFlow: "Fund Flow",
  dueBills: "Due Bills",
  wip: "Work in Progress",
  contractors: "Contractors",
  tenders: "Tenders",
  paymentSchedules: "Payment Schedules",
  vehicleLogBook: "Vehicle Log Book",
  assets: "Property",
  inOutRegister: "In-Out Register",
  tadaBills: "TADA Bills",
  taskManagement: "Tasks",
  reports: "Reports",
  exportImport: "Export / Import",
  notifications: "Notifications",
  auditLog: "Audit Log",
  userManagement: "User Management",
  progressApp: "Progress App",
};

const validActions = new Set(["create", "read", "update", "delete", "admin"]);

export interface UserModulePermissionRow {
  resource: string;
  label: string;
  roleDefault: string[];
  override: string[] | null;
  effective: string[];
}

export async function getUserModulePermissions(userId: string): Promise<{
  success: boolean;
  data?: {
    userId: string;
    userName: string | null;
    userEmail: string;
    role: string;
    modules: UserModulePermissionRow[];
  };
  error?: string;
}> {
  try {
    const actor = await requireAuth();
    if (actor.role !== Role.ADMIN) {
      return { success: false, error: "Only admins can view user module access." };
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!target) {
      return { success: false, error: "User not found." };
    }

    const [roleOverrides, userOverrides] = await Promise.all([
      prisma.rolePermission.findMany({ where: { role: target.role } }),
      prisma.userModulePermission.findMany({ where: { userId } }),
    ]);

    const modules: UserModulePermissionRow[] = Object.keys(
      defaultPermissions
    ).map((resource) => {
      const roleDefault =
        roleOverrides.find((o) => o.resource === resource)?.allowedActions ??
        defaultPermissions[resource]?.[target.role] ??
        [];
      const override =
        userOverrides.find((o) => o.resource === resource)?.allowedActions ??
        null;
      return {
        resource,
        label: moduleLabels[resource] ?? resource,
        roleDefault,
        override,
        effective: override ?? roleDefault,
      };
    });

    return {
      success: true,
      data: {
        userId: target.id,
        userName: target.name,
        userEmail: target.email,
        role: target.role,
        modules,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function setUserModulePermission(
  userId: string,
  resource: string,
  allowedActions: string[] | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireAuth();
    if (actor.role !== Role.ADMIN) {
      return { success: false, error: "Only admins can modify user module access." };
    }

    if (!(resource in defaultPermissions)) {
      return { success: false, error: "Unknown module." };
    }
    if (allowedActions !== null && allowedActions.some((a) => !validActions.has(a))) {
      return { success: false, error: "Invalid action in override." };
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!target) {
      return { success: false, error: "User not found." };
    }
    if (target.role === "ADMIN") {
      return { success: false, error: "Admin module access cannot be restricted." };
    }

    if (allowedActions === null) {
      await prisma.userModulePermission.deleteMany({
        where: { userId, resource },
      });
    } else {
      await prisma.userModulePermission.upsert({
        where: { userId_resource: { userId, resource } },
        create: { userId, resource, allowedActions },
        update: { allowedActions },
      });
    }

    await audit(
      actor.id,
      allowedActions === null ? "delete" : "update",
      "UserModulePermission",
      `${userId}:${resource}`,
      { userId, resource, allowedActions }
    );

    invalidatePermissionCache();
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

const allAiDataModules = [
  "projects",
  "dueBills",
  "fundFlow",
  "tadaClaims",
  "tenders",
  "tasks",
  "vehicles",
  "paymentSchedules",
  "contractors",
];

export async function getAiDataAccessMatrix(): Promise<{
  success: boolean;
  data?: Record<string, string[]>;
  error?: string;
}> {
  try {
    await requireAuth();

    const setting = await prisma.systemSetting.findUnique({
      where: { key: "ai_data_access" },
    });

    if (!setting) {
      const defaults: Record<string, string[]> = {};
      for (const role of ["ADMIN", "MANAGER", "STAFF", "AUDITOR"]) {
        defaults[role] = [...allAiDataModules];
      }
      return { success: true, data: defaults };
    }

    const matrix = JSON.parse(setting.value) as Record<string, string[]>;
    for (const role of ["ADMIN", "MANAGER", "STAFF", "AUDITOR"]) {
      if (!matrix[role]) {
        matrix[role] = role === "ADMIN" ? [...allAiDataModules] : [];
      }
    }
    return { success: true, data: matrix };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function updateAiDataAccess(
  matrix: Record<string, string[]>
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Only admins can modify AI data access." };
    }

    matrix.ADMIN = [...allAiDataModules];

    await prisma.systemSetting.upsert({
      where: { key: "ai_data_access" },
      create: {
        key: "ai_data_access",
        value: JSON.stringify(matrix),
      },
      update: {
        value: JSON.stringify(matrix),
      },
    });

    await audit(user.id, "update", "SystemSetting", "ai_data_access", {
      matrix,
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

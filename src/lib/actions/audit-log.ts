"use server";

import { prisma } from "@/lib/prisma";
import {
  withPermission,
  checkRateLimit,
  audit,
  ActionResult,
} from "./wrapper";
import {
  auditLogFilterSchema,
  AuditLogFilterInput,
} from "@/lib/schemas/notifications";
import { buildAuditLogWhere } from "@/lib/queries/audit-log";

export async function getAuditLogs(
  filter?: AuditLogFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("auditLog", "read", async () => {
    const parsed = filter ? auditLogFilterSchema.parse(filter) : undefined;
    const where = buildAuditLogWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { rows, total };
  });
}

export async function getAuditLogStats(): Promise<
  ActionResult<{
    totalEvents: number;
    eventsByAction: Record<string, number>;
    eventsByEntity: Record<string, number>;
    recentUsers: { id: string; name: string | null; email: string; count: number }[];
  }>
> {
  return withPermission("auditLog", "read", async () => {
    const totalEvents = await prisma.auditLog.count();

    const actionGroups = await prisma.auditLog.groupBy({
      by: ["action"],
      _count: true,
    });

    const entityGroups = await prisma.auditLog.groupBy({
      by: ["entity"],
      _count: true,
    });

    const recentUserLogs = await prisma.auditLog.findMany({
      where: { userId: { not: null } },
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
      },
      distinct: ["userId"],
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const userCounts = await Promise.all(
      recentUserLogs
        .filter((log) => log.userId)
        .map(async (log) => ({
          id: log.userId!,
          name: log.user?.name ?? null,
          email: log.user?.email ?? "",
          count: await prisma.auditLog.count({
            where: { userId: log.userId },
          }),
        }))
    );

    return {
      totalEvents,
      eventsByAction: Object.fromEntries(
        actionGroups.map((g) => [g.action, g._count])
      ),
      eventsByEntity: Object.fromEntries(
        entityGroups.map((g) => [g.entity, g._count])
      ),
      recentUsers: userCounts,
    };
  });
}

export async function getUsers(): Promise<ActionResult<unknown[]>> {
  return withPermission("userManagement", "read", async () => {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });
}

export async function updateUserRole(
  userId: string,
  role: "ADMIN" | "MANAGER" | "STAFF" | "AUDITOR"
): Promise<ActionResult<{ id: string }>> {
  return withPermission("userManagement", "update", async (user) => {
    await checkRateLimit(user.id);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    await audit(user.id, "update", "User", updated.id, {
      field: "role",
      newValue: role,
    });

    return { id: updated.id };
  });
}

export async function toggleUserActive(
  userId: string
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  return withPermission("userManagement", "update", async (user) => {
    await checkRateLimit(user.id);

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new Error("User not found");

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !existing.isActive },
    });

    await audit(user.id, "update", "User", updated.id, {
      field: "isActive",
      newValue: updated.isActive,
    });

    return { id: updated.id, isActive: updated.isActive };
  });
}

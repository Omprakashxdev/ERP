"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  withPermission,
  checkRateLimit,
  audit,
  ActionResult,
} from "./wrapper";
import {
  notificationRuleCreateSchema,
  notificationRuleUpdateSchema,
  notificationFilterSchema,
  NotificationRuleCreateInput,
  NotificationRuleUpdateInput,
  NotificationFilterInput,
} from "@/lib/schemas/notifications";
import { runNotificationChecks } from "@/lib/notification-engine";
import { NotificationPriority, NotificationType } from "@prisma/client";

export async function getNotifications(
  filter?: NotificationFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number; unreadCount: number }>> {
  return withPermission("notifications", "read", async (user) => {
    const parsed = filter ? notificationFilterSchema.parse(filter) : undefined;

    const where: Record<string, unknown> = { userId: user.id };
    if (parsed?.isRead === "true") where.isRead = true;
    if (parsed?.isRead === "false") where.isRead = false;
    if (parsed?.type) where.type = parsed.type;
    if (parsed?.priority) where.priority = parsed.priority;
    if (parsed?.module) where.module = parsed.module;

    const [rows, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
    ]);

    return { rows, total, unreadCount };
  });
}

export async function getUnreadNotificationCount(): Promise<
  ActionResult<number>
> {
  return withPermission("notifications", "read", async (user) => {
    const count = await prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });
    return count;
  });
}

export async function markNotificationRead(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("notifications", "update", async (user) => {
    await prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { isRead: true, readAt: new Date() },
    });

    revalidatePath("/dashboard");
    return { id };
  });
}

export async function markAllNotificationsRead(): Promise<
  ActionResult<{ count: number }>
> {
  return withPermission("notifications", "update", async (user) => {
    const result = await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    revalidatePath("/dashboard");
    return { count: result.count };
  });
}

export async function deleteNotification(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("notifications", "delete", async (user) => {
    await prisma.notification.deleteMany({
      where: { id, userId: user.id },
    });

    revalidatePath("/dashboard");
    return { id };
  });
}

export async function triggerNotificationCheck(): Promise<
  ActionResult<{ generated: number; errors: string[] }>
> {
  return withPermission("notifications", "admin", async (user) => {
    await checkRateLimit(user.id);
    const result = await runNotificationChecks();

    await audit(user.id, "trigger", "NotificationEngine", "check", {
      generated: result.generated,
      errors: result.errors,
    });

    revalidatePath("/dashboard");
    return result;
  });
}

export async function getNotificationRules(): Promise<ActionResult<unknown[]>> {
  return withPermission("notifications", "read", async () => {
    return prisma.notificationRule.findMany({
      orderBy: { createdAt: "desc" },
    });
  });
}

export async function createNotificationRule(
  input: NotificationRuleCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("notifications", "admin", async (user) => {
    const parsed = notificationRuleCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const rule = await prisma.notificationRule.create({
      data: parsed,
    });

    await audit(user.id, "create", "NotificationRule", rule.id, {
      name: parsed.name,
      type: parsed.type,
    });

    revalidatePath("/dashboard/settings");
    return { id: rule.id };
  });
}

export async function updateNotificationRule(
  input: NotificationRuleUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("notifications", "admin", async (user) => {
    const parsed = notificationRuleUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const rule = await prisma.notificationRule.update({
      where: { id },
      data,
    });

    await audit(user.id, "update", "NotificationRule", rule.id, {
      name: rule.name,
    });

    revalidatePath("/dashboard/settings");
    return { id: rule.id };
  });
}

export async function deleteNotificationRule(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("notifications", "admin", async (user) => {
    await checkRateLimit(user.id);

    await prisma.notificationRule.delete({ where: { id } });

    await audit(user.id, "delete", "NotificationRule", id, {});

    revalidatePath("/dashboard/settings");
    return { id };
  });
}

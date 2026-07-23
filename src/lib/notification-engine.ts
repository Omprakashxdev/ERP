import { prisma } from "@/lib/prisma";
import { NotificationType, NotificationPriority, Role } from "@prisma/client";

interface GeneratedNotification {
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  module: string;
  entityId: string;
  entityName: string;
}

function daysUntil(date: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = new Date(date).getTime() - new Date().getTime();
  return Math.ceil(diff / msPerDay);
}

function daysSince(date: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = new Date().getTime() - new Date(date).getTime();
  return Math.floor(diff / msPerDay);
}

async function getAllAdminUsers(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN, isActive: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

async function getAllActiveUsers(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function checkPaymentSchedules(thresholdDays: number): Promise<GeneratedNotification[]> {
  const notifications: GeneratedNotification[] = [];
  const now = new Date();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + thresholdDays);

  const upcoming = await prisma.paymentSchedule.findMany({
    where: {
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: {
        gte: now,
        lte: threshold,
      },
    },
  });

  const overdue = await prisma.paymentSchedule.findMany({
    where: {
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { lt: now },
    },
  });

  const adminIds = await getAllAdminUsers();

  for (const sched of upcoming) {
    const days = daysUntil(sched.dueDate!);
    for (const userId of adminIds) {
      notifications.push({
        userId,
        type: NotificationType.DUE_DATE_REMINDER,
        priority: NotificationPriority.MEDIUM,
        title: `Payment due in ${days} days`,
        message: `Payment schedule (${sched.paymentType ?? "N/A"}) of ₹${sched.amount} is due on ${sched.dueDate!.toLocaleDateString("en-IN")}.`,
        module: "paymentSchedules",
        entityId: sched.id,
        entityName: sched.detail ?? sched.paymentType ?? "Payment",
      });
    }
  }

  for (const sched of overdue) {
    const days = daysSince(sched.dueDate!);
    for (const userId of adminIds) {
      notifications.push({
        userId,
        type: NotificationType.OVERDUE_PAYMENT,
        priority: NotificationPriority.URGENT,
        title: `Payment overdue by ${days} days`,
        message: `Payment schedule (${sched.paymentType ?? "N/A"}) of ₹${sched.amount} was due on ${sched.dueDate!.toLocaleDateString("en-IN")}.`,
        module: "paymentSchedules",
        entityId: sched.id,
        entityName: sched.detail ?? sched.paymentType ?? "Payment",
      });
    }
  }

  return notifications;
}

async function checkInOutRegisterReplies(thresholdDays: number): Promise<GeneratedNotification[]> {
  const notifications: GeneratedNotification[] = [];
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - thresholdDays);

  const pending = await prisma.inOutRegister.findMany({
    where: {
      replyDate: null,
      receivedDate: { lte: threshold },
    },
    include: { client: { select: { name: true } } },
  });

  const adminIds = await getAllAdminUsers();

  for (const entry of pending) {
    const days = daysSince(entry.receivedDate);
    for (const userId of adminIds) {
      notifications.push({
        userId,
        type: NotificationType.PENDING_REPLY,
        priority: days > 20 ? NotificationPriority.URGENT : NotificationPriority.HIGH,
        title: `Pending reply for ${days} days`,
        message: `Document ${entry.documentRefNo} from ${entry.client.name} has been pending a reply for ${days} days.`,
        module: "inOutRegister",
        entityId: entry.id,
        entityName: entry.documentRefNo,
      });
    }
  }

  return notifications;
}

async function checkVehicleDocExpiry(thresholdDays: number): Promise<GeneratedNotification[]> {
  const notifications: GeneratedNotification[] = [];
  const now = new Date();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + thresholdDays);

  const vehicles = await prisma.vehicle.findMany({
    where: { status: "ACTIVE" },
  });

  const adminIds = await getAllAdminUsers();

  for (const vehicle of vehicles) {
    const docs: { label: string; date: Date | null }[] = [
      { label: "RC", date: vehicle.rcExpiryDate },
      { label: "Insurance", date: vehicle.insuranceExpiryDate },
      { label: "PUC", date: vehicle.pucExpiryDate },
    ];

    for (const doc of docs) {
      if (!doc.date) continue;

      if (doc.date < now) {
        const days = daysSince(doc.date);
        for (const userId of adminIds) {
          notifications.push({
            userId,
            type: NotificationType.VEHICLE_DOC_EXPIRY,
            priority: NotificationPriority.URGENT,
            title: `${doc.label} expired for ${vehicle.registrationNumber}`,
            message: `Vehicle ${vehicle.registrationNumber}'s ${doc.label} expired ${days} days ago.`,
            module: "vehicleLogBook",
            entityId: vehicle.id,
            entityName: vehicle.registrationNumber,
          });
        }
      } else if (doc.date <= threshold) {
        const days = daysUntil(doc.date);
        for (const userId of adminIds) {
          notifications.push({
            userId,
            type: NotificationType.VEHICLE_DOC_EXPIRY,
            priority: NotificationPriority.HIGH,
            title: `${doc.label} expiring in ${days} days`,
            message: `Vehicle ${vehicle.registrationNumber}'s ${doc.label} expires on ${doc.date.toLocaleDateString("en-IN")}.`,
            module: "vehicleLogBook",
            entityId: vehicle.id,
            entityName: vehicle.registrationNumber,
          });
        }
      }
    }
  }

  return notifications;
}

async function checkDueBills(thresholdDays: number): Promise<GeneratedNotification[]> {
  const notifications: GeneratedNotification[] = [];
  const now = new Date();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + thresholdDays);

  const upcomingBills = await prisma.dueBill.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL"] },
      billDate: {
        gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      },
    },
    include: { project: { select: { name: true } } },
  });

  const adminIds = await getAllAdminUsers();

  for (const bill of upcomingBills) {
    if (bill.billDate && bill.billDate <= threshold && bill.billDate >= now) {
      const days = daysUntil(bill.billDate);
      for (const userId of adminIds) {
        notifications.push({
          userId,
          type: NotificationType.DUE_DATE_REMINDER,
          priority: NotificationPriority.MEDIUM,
          title: `Due bill reminder in ${days} days`,
          message: `Bill for ${bill.project.name} (₹${bill.billAmount}) is due in ${days} days.`,
          module: "dueBills",
          entityId: bill.id,
          entityName: bill.scheme,
        });
      }
    }
  }

  return notifications;
}

export async function runNotificationChecks(): Promise<{
  generated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let generated = 0;

  try {
    const paymentNotifs = await checkPaymentSchedules(7);
    const replyNotifs = await checkInOutRegisterReplies(15);
    const vehicleNotifs = await checkVehicleDocExpiry(30);
    const dueBillNotifs = await checkDueBills(7);

    const allNotifs = [
      ...paymentNotifs,
      ...replyNotifs,
      ...vehicleNotifs,
      ...dueBillNotifs,
    ];

    for (const notif of allNotifs) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: notif.userId,
          entityId: notif.entityId,
          type: notif.type,
          isRead: false,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: notif.userId,
            type: notif.type,
            priority: notif.priority,
            title: notif.title,
            message: notif.message,
            module: notif.module,
            entityId: notif.entityId,
            entityName: notif.entityName,
          },
        });
        generated++;
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Unknown error");
  }

  return { generated, errors };
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: vi.fn() },
    staff: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    notification: { findFirst: vi.fn(), create: vi.fn() },
    paymentSchedule: { findMany: vi.fn() },
    inOutRegister: { findMany: vi.fn() },
    vehicle: { findMany: vi.fn() },
    dueBill: { findMany: vi.fn() },
  },
}));

const prismaMock = prisma as any;

describe("Task due-date reminders (P4)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.paymentSchedule.findMany.mockResolvedValue([]);
    prismaMock.inOutRegister.findMany.mockResolvedValue([]);
    prismaMock.vehicle.findMany.mockResolvedValue([]);
    prismaMock.dueBill.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.notification.findFirst.mockResolvedValue(null);
    prismaMock.notification.create.mockResolvedValue({});
  });

  it("notifies the assignee's linked user for a due-soon task", async () => {
    const { runNotificationChecks } = await import("../notification-engine");
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: "ctask1",
        title: "File GST",
        dueDate: soon,
        assignedToId: "cs-1",
      },
    ]);
    prismaMock.staff.findUnique.mockResolvedValue({ email: "staff@saec.com" });
    prismaMock.user.findFirst.mockResolvedValue({ id: "u-staff" });
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await runNotificationChecks();
    expect(result.generated).toBe(1);
    const notif = prismaMock.notification.create.mock.calls[0][0].data;
    expect(notif.userId).toBe("u-staff");
    expect(notif.module).toBe("tasks");
    expect(notif.title).toContain("due in");
  });

  it("overdue task notifies with overdue wording and HIGH priority", async () => {
    const { runNotificationChecks } = await import("../notification-engine");
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    prismaMock.task.findMany.mockResolvedValue([
      { id: "ct1", title: "File GST", dueDate: past, assignedToId: "cs-1" },
    ]);
    prismaMock.staff.findUnique.mockResolvedValue({ email: "s@saec.com" });
    prismaMock.user.findFirst.mockResolvedValue({ id: "u-s" });
    prismaMock.user.findMany.mockResolvedValue([]);

    await runNotificationChecks();
    const notif = prismaMock.notification.create.mock.calls[0][0].data;
    expect(notif.priority).toBe("HIGH");
    expect(notif.title).toContain("overdue");
  });

  it("assignee without linked user account is skipped, not erroring", async () => {
    const { runNotificationChecks } = await import("../notification-engine");
    prismaMock.task.findMany.mockResolvedValue([
      { id: "ct1", title: "X", dueDate: new Date(), assignedToId: "cs-x" },
    ]);
    prismaMock.staff.findUnique.mockResolvedValue({ email: null });

    const result = await runNotificationChecks();
    expect(result.generated).toBe(0);
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("does not re-notify within 24h while unread", async () => {
    const { runNotificationChecks } = await import("../notification-engine");
    prismaMock.task.findMany.mockResolvedValue([
      { id: "ct1", title: "X", dueDate: new Date(), assignedToId: "cs-1" },
    ]);
    prismaMock.staff.findUnique.mockResolvedValue({ email: "s@x.com" });
    prismaMock.user.findFirst.mockResolvedValue({ id: "u-s" });
    prismaMock.notification.findFirst.mockResolvedValue({ id: "n1" }); // recent unread

    const result = await runNotificationChecks();
    expect(result.generated).toBe(0);
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});

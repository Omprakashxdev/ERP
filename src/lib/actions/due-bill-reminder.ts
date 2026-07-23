"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withPermission, audit, ActionResult } from "./wrapper";
import { z } from "zod";

const reminderLetterSchema = z.object({
  billId: z.string().min(1),
});

export async function generateReminderLetter(
  input: z.infer<typeof reminderLetterSchema>
): Promise<ActionResult<{ taskId: string }>> {
  return withPermission("dueBills", "create", async (user) => {
    const parsed = reminderLetterSchema.parse(input);

    const bill = await prisma.dueBill.findUnique({
      where: { id: parsed.billId },
      include: {
        project: {
          select: {
            name: true,
            client: { select: { name: true } },
          },
        },
      },
    });

    if (!bill) throw new Error("Due bill not found");

    const pendingAmount = Number(bill.billAmount) - Number(bill.receivedAmount);
    const daysPending = bill.billDate
      ? Math.floor((Date.now() - new Date(bill.billDate).getTime()) / 86400000)
      : 0;

    // Find admin manager to assign the task to
    const adminManager = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (!adminManager) throw new Error("No active admin user found to assign task");

    // Find a staff member linked to this admin user
    let staffId: string | null = null;
    const staff = await prisma.staff.findFirst({
      where: { email: { not: null } },
      select: { id: true },
    });

    if (staff) {
      staffId = staff.id;
    } else {
      // Create a system staff if none exists
      const systemStaff = await prisma.staff.create({
        data: {
          name: "System Admin",
          designation: "Admin Manager",
          email: "admin@saec.com",
        },
      });
      staffId = systemStaff.id;
    }

    // Check if a reminder task already exists for this bill in the last 30 days
    const existingTask = await prisma.task.findFirst({
      where: {
        title: { contains: `Reminder: ${bill.scheme}` },
        createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
    });

    if (existingTask) {
      return { taskId: existingTask.id };
    }

    // Create the follow-up task
    const task = await prisma.task.create({
      data: {
        title: `Reminder: ${bill.scheme} - ${bill.project.name}`,
        description: `Follow up on pending due bill for ${bill.project.client.name} - ${bill.project.name}. Bill amount: ₹${Number(bill.billAmount).toLocaleString("en-IN")}, Pending: ₹${pendingAmount.toLocaleString("en-IN")}, Pending for ${daysPending} days. Reminder letter generated on ${new Date().toLocaleDateString("en-IN")}.`,
        status: "OPEN",
        priority: daysPending > 180 ? "CRITICAL" : daysPending > 90 ? "HIGH" : "MEDIUM",
        assignedToId: staffId,
        assignedById: user.id,
        dueDate: new Date(Date.now() + 15 * 86400000),
      },
    });

    await audit(user.id, "create", "Task", task.id, {
      action: "reminder_letter_generated",
      billId: parsed.billId,
      scheme: bill.scheme,
      pendingAmount,
      daysPending,
    });

    revalidatePath("/dashboard/due-bills");
    revalidatePath("/dashboard/tasks");

    return { taskId: task.id };
  });
}

export async function getStaleDueBills(): Promise<
  ActionResult<
    {
      id: string;
      scheme: string;
      billDate: Date | null;
      billAmount: unknown;
      receivedAmount: unknown;
      daysPending: number;
      projectName: string;
      clientName: string;
    }[]
  >
> {
  return withPermission("dueBills", "read", async () => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);

    const bills = await prisma.dueBill.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        billDate: { lte: threeMonthsAgo },
      },
      include: {
        project: {
          select: {
            name: true,
            client: { select: { name: true } },
          },
        },
      },
      orderBy: { billDate: "asc" },
      take: 100,
    });

    return bills.map((b) => ({
      id: b.id,
      scheme: b.scheme,
      billDate: b.billDate,
      billAmount: b.billAmount,
      receivedAmount: b.receivedAmount,
      daysPending: b.billDate
        ? Math.floor((Date.now() - new Date(b.billDate).getTime()) / 86400000)
        : 0,
      projectName: b.project.name,
      clientName: b.project.client.name,
    }));
  });
}

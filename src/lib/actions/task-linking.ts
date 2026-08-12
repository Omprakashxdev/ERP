"use server";

import { prisma } from "@/lib/prisma";

interface CreateLinkedTaskInput {
  title: string;
  description: string;
  dueDate: Date | null;
  sourceModule: string;
  sourceEntityId: string;
  projectId?: string | null;
  assignedToId?: string | null;
  assignedById?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

/**
 * Creates a task linked to a source entity (WIP, Tender, etc.)
 * Only creates the task if one doesn't already exist for the same sourceModule + sourceEntityId + title.
 */
export async function createLinkedTask(input: CreateLinkedTaskInput): Promise<void> {
  // Check if a task with the same source and title already exists
  const existing = await prisma.task.findFirst({
    where: {
      sourceModule: input.sourceModule,
      sourceEntityId: input.sourceEntityId,
      title: input.title,
    },
  });

  if (existing) return;

  // Need an assignee — if none specified, find the first active staff member
  let assignedToId = input.assignedToId;
  if (!assignedToId) {
    const firstStaff = await prisma.staff.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    if (!firstStaff) return;
    assignedToId = firstStaff.id;
  }

  await prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      sourceModule: input.sourceModule,
      sourceEntityId: input.sourceEntityId,
      projectId: input.projectId ?? null,
      assignedToId,
      assignedById: input.assignedById ?? null,
      priority: input.priority ?? "MEDIUM",
    },
  });
}

/**
 * Deletes all tasks linked to a source entity when the source is deleted.
 */
export async function deleteLinkedTasks(sourceModule: string, sourceEntityId: string): Promise<void> {
  await prisma.task.deleteMany({
    where: {
      sourceModule,
      sourceEntityId,
    },
  });
}

// ─── WIP Linking ───

interface WipLinkData {
  wipId: string;
  projectId: string;
  projectName?: string;
  loiReceiptDate?: Date | null;
  agreementDate?: Date | null;
  workOrderDate?: Date | null;
  securityDepositReturnDate?: Date | null;
  hoCoordinatorId?: string | null;
  roCoordinatorId?: string | null;
}

export async function createWipLinkedTasks(data: WipLinkData): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
    select: { name: true },
  });
  const projectName = data.projectName ?? project?.name ?? "Unknown Project";

  const tasks: CreateLinkedTaskInput[] = [];

  if (data.loiReceiptDate) {
    tasks.push({
      title: `LOI received — ${projectName}`,
      description: `LOI has been received for project "${projectName}". Update and upload to reminder/to-do list with concerned authority for time limit compliance.`,
      dueDate: data.loiReceiptDate,
      sourceModule: "WIP",
      sourceEntityId: data.wipId,
      projectId: data.projectId,
      assignedToId: data.hoCoordinatorId ?? null,
      priority: "HIGH",
    });
  }

  if (data.agreementDate) {
    tasks.push({
      title: `Agreement — ${projectName}`,
      description: `Agreement schedule updated for project "${projectName}". Update and upload to reminder/to-do list with concerned authority for time limit compliance.`,
      dueDate: data.agreementDate,
      sourceModule: "WIP",
      sourceEntityId: data.wipId,
      projectId: data.projectId,
      assignedToId: data.hoCoordinatorId ?? null,
      priority: "HIGH",
    });
  }

  if (data.workOrderDate) {
    tasks.push({
      title: `Work order received — ${projectName}`,
      description: `Work order has been received for project "${projectName}". Update and upload with concerned authority & staff members.`,
      dueDate: data.workOrderDate,
      sourceModule: "WIP",
      sourceEntityId: data.wipId,
      projectId: data.projectId,
      assignedToId: data.roCoordinatorId ?? data.hoCoordinatorId ?? null,
      priority: "HIGH",
    });
  }

  if (data.securityDepositReturnDate) {
    tasks.push({
      title: `Security deposit return — ${projectName}`,
      description: `Security deposit return date for project "${projectName}". Upload details to concerned authority & staff members.`,
      dueDate: data.securityDepositReturnDate,
      sourceModule: "WIP",
      sourceEntityId: data.wipId,
      projectId: data.projectId,
      assignedToId: data.hoCoordinatorId ?? null,
      priority: "MEDIUM",
    });
  }

  for (const task of tasks) {
    await createLinkedTask(task);
  }
}

// ─── Tender Linking ───

interface TenderLinkData {
  tenderId: string;
  tenderName: string;
  tenderFeeDate?: Date | null;
  emdDate?: Date | null;
  emdReturnCollectionDate?: Date | null;
  biddingLastDate?: Date | null;
  dateOfOpening?: Date | null;
  preBidMeetingDate?: Date | null;
}

export async function createTenderLinkedTasks(data: TenderLinkData): Promise<void> {
  const tasks: CreateLinkedTaskInput[] = [];

  if (data.tenderFeeDate) {
    tasks.push({
      title: `Tender fee payment — ${data.tenderName}`,
      description: `Tender fee payment for "${data.tenderName}". Update to Tender Expense List.`,
      dueDate: data.tenderFeeDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      priority: "HIGH",
    });
  }

  if (data.emdDate) {
    tasks.push({
      title: `EMD deposit — ${data.tenderName}`,
      description: `EMD deposit for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.emdDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      priority: "HIGH",
    });
  }

  if (data.emdReturnCollectionDate) {
    tasks.push({
      title: `EMD return collection — ${data.tenderName}`,
      description: `EMD return collection date for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.emdReturnCollectionDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      priority: "MEDIUM",
    });
  }

  if (data.biddingLastDate) {
    tasks.push({
      title: `Bidding last date — ${data.tenderName}`,
      description: `Last date for bidding for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.biddingLastDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      priority: "HIGH",
    });
  }

  if (data.dateOfOpening) {
    tasks.push({
      title: `Tender opening date — ${data.tenderName}`,
      description: `Date of opening for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.dateOfOpening,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      priority: "HIGH",
    });
  }

  if (data.preBidMeetingDate) {
    tasks.push({
      title: `Pre-bid meeting — ${data.tenderName}`,
      description: `Pre-bid meeting for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.preBidMeetingDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      priority: "MEDIUM",
    });
  }

  for (const task of tasks) {
    await createLinkedTask(task);
  }
}

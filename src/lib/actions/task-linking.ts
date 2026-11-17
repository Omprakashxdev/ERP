"use server";

import { prisma } from "@/lib/prisma";

interface CreateLinkedTaskInput {
  title: string;
  description: string;
  dueDate: Date | null;
  sourceModule: string;
  sourceEntityId: string;
  /**
   * Stable identity of the source event (e.g. "bidding_last",
   * "cc:<staffId>"). Never derived from the mutable task title —
   * renaming the task cannot cause a duplicate once keyed.
   */
  sourceEventKey?: string;
  projectId?: string | null;
  assignedToId?: string | null;
  assignedById?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

/**
 * Creates a task linked to a source entity (WIP, Tender, etc.)
 *
 * Identity rules:
 * - With `sourceEventKey`: dedup on sourceModule + sourceEntityId +
 *   sourceEventKey only. Title and assignee are display data and never
 *   part of the identity. Backed by the unique index — concurrent saves
 *   cannot produce duplicates.
 * - Without a key (legacy/manual callers): dedup on sourceModule +
 *   sourceEntityId + title + assignedToId, unchanged.
 */
export async function createLinkedTask(input: CreateLinkedTaskInput): Promise<void> {
  if (input.sourceEventKey) {
    // A keyed task must always carry its source linkage.
    if (!input.sourceModule || !input.sourceEntityId) {
      throw new Error(
        "Event-keyed linked tasks require sourceModule and sourceEntityId"
      );
    }

    const keyed = await prisma.task.findFirst({
      where: {
        sourceModule: input.sourceModule,
        sourceEntityId: input.sourceEntityId,
        sourceEventKey: input.sourceEventKey,
      },
      select: { id: true },
    });
    if (keyed) return;

    // Legacy adoption: adopt an unkeyed historical task only when exactly
    // one record matches this event's module+entity+title+assignee.
    // Zero or ambiguous matches are left untouched — never guessed.
    const legacyMatches = await prisma.task.findMany({
      where: {
        sourceModule: input.sourceModule,
        sourceEntityId: input.sourceEntityId,
        sourceEventKey: null,
        title: input.title,
        assignedToId: input.assignedToId ?? undefined,
      },
      select: { id: true },
      take: 2,
    });
    if (legacyMatches.length === 1) {
      // Race-safe conditional adoption: only update if still unkeyed.
      const adopted = await prisma.task.updateMany({
        where: { id: legacyMatches[0].id, sourceEventKey: null },
        data: { sourceEventKey: input.sourceEventKey },
      });
      if (adopted.count === 1) return;
      // Another request keyed it first — fall through to the keyed check.
      const again = await prisma.task.findFirst({
        where: {
          sourceModule: input.sourceModule,
          sourceEntityId: input.sourceEntityId,
          sourceEventKey: input.sourceEventKey,
        },
        select: { id: true },
      });
      if (again) return;
    } else if (legacyMatches.length > 1) {
      // Ambiguous — report for manual resolution, do not silently create
      // a likely duplicate nor arbitrarily pick one.
      console.warn(
        `[createLinkedTask] Ambiguous legacy tasks for ${input.sourceModule}` +
          `/${input.sourceEntityId}/${input.sourceEventKey}: ` +
          `${legacyMatches.map((m) => m.id).join(", ")} — needs manual review`
      );
      return;
    }
  } else {
    // Legacy unkeyed dedup — title + assignee identify the task.
    const existing = await prisma.task.findFirst({
      where: {
        sourceModule: input.sourceModule,
        sourceEntityId: input.sourceEntityId,
        title: input.title,
        assignedToId: input.assignedToId ?? undefined,
      },
    });
    if (existing) return;
  }

  // Never invent an assignee — when no responsible person is resolvable,
  // skip creation and alert administrators instead of silently assigning
  // the task to the first active staff member.
  const assignedToId = input.assignedToId;
  if (!assignedToId) {
    await notifyAdminsOfUnassignedLinkedTask(input).catch(() => {});
    console.warn(
      `[createLinkedTask] No assignee for ${input.sourceModule}` +
        `/${input.sourceEntityId}` +
        (input.sourceEventKey ? `/${input.sourceEventKey}` : "") +
        ` — "${input.title}" not created`
    );
    return;
  }

  try {
    await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        sourceModule: input.sourceModule,
        sourceEntityId: input.sourceEntityId,
        sourceEventKey: input.sourceEventKey ?? null,
        projectId: input.projectId ?? null,
        assignedToId,
        assignedById: input.assignedById ?? null,
        priority: input.priority ?? "MEDIUM",
      },
    });
  } catch (error) {
    // Race: another request created this event's task between our check
    // and insert. Treat as successful dedup only when the keyed task
    // actually exists; re-throw anything unrelated.
    const code = (error as { code?: string })?.code;
    if (code === "P2002" && input.sourceEventKey) {
      const existing = await prisma.task.findFirst({
        where: {
          sourceModule: input.sourceModule,
          sourceEntityId: input.sourceEntityId,
          sourceEventKey: input.sourceEventKey,
        },
        select: { id: true },
      });
      if (existing) return;
    }
    throw error;
  }
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
  raBill1Date?: Date | null;
  raBill1Amount?: unknown;
  raBill1Path?: string | null;
  raBill2Date?: Date | null;
  raBill2Amount?: unknown;
  raBill2Path?: string | null;
  raBill3Date?: Date | null;
  raBill3Amount?: unknown;
  raBill3Path?: string | null;
  raBill4Date?: Date | null;
  raBill4Amount?: unknown;
  raBill4Path?: string | null;
  annexure3aPath?: string | null;
  completionDate?: Date | null;
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
      sourceEventKey: "loi",
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
      sourceEventKey: "agreement",
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
      sourceEventKey: "work_order",
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
      sourceEventKey: "security_deposit",
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

  // RA Bills 1–4 tasks & reminders for Concerned Authority
  const raBills = [
    { n: 1, date: data.raBill1Date, amt: data.raBill1Amount, path: data.raBill1Path },
    { n: 2, date: data.raBill2Date, amt: data.raBill2Amount, path: data.raBill2Path },
    { n: 3, date: data.raBill3Date, amt: data.raBill3Amount, path: data.raBill3Path },
    { n: 4, date: data.raBill4Date, amt: data.raBill4Amount, path: data.raBill4Path },
  ];

  for (const b of raBills) {
    if (b.date || b.path || b.amt) {
      tasks.push({
        sourceEventKey: `ra_bill_${b.n}`,
        title: `RA Bill ${b.n} — ${projectName}`,
        description: `RA Bill ${b.n} details & copy uploaded for project "${projectName}". Upload details and verify with concern authority.`,
        dueDate: b.date ?? new Date(),
        sourceModule: "WIP",
        sourceEntityId: data.wipId,
        projectId: data.projectId,
        assignedToId: data.roCoordinatorId ?? data.hoCoordinatorId ?? null,
        priority: "MEDIUM",
      });
    }
  }

  // 3A Certificate / Annexure 3A closure task
  if (data.annexure3aPath || data.completionDate) {
    tasks.push({
      sourceEventKey: "annexure_3a",
      title: `3A Certificate & Project Closure — ${projectName}`,
      description: `3A Certificate / Annexure 3A submitted for project "${projectName}". Project close after 3A certificate — upload detail to concern authority.`,
      dueDate: data.completionDate ?? new Date(),
      sourceModule: "WIP",
      sourceEntityId: data.wipId,
      projectId: data.projectId,
      assignedToId: data.hoCoordinatorId ?? data.roCoordinatorId ?? null,
      priority: "HIGH",
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
  negotiationMeetingDate?: Date | null;
  concernAuthorityId?: string | null;
}

export async function createTenderLinkedTasks(data: TenderLinkData): Promise<void> {
  // Workbook rule: deadline reminders go "to do list with concern
  // authority" — without an explicitly chosen responsible person no
  // task is created; never invent an assignee.
  if (!data.concernAuthorityId) return;

  const tasks: CreateLinkedTaskInput[] = [];

  if (data.tenderFeeDate) {
    tasks.push({
      sourceEventKey: "tender_fee",
      title: `Tender fee payment — ${data.tenderName}`,
      description: `Tender fee payment for "${data.tenderName}". Update to Tender Expense List.`,
      dueDate: data.tenderFeeDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      assignedToId: data.concernAuthorityId ?? null,
      priority: "HIGH",
    });
  }

  if (data.emdDate) {
    tasks.push({
      sourceEventKey: "emd_deposit",
      title: `EMD deposit — ${data.tenderName}`,
      description: `EMD deposit for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.emdDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      assignedToId: data.concernAuthorityId ?? null,
      priority: "HIGH",
    });
  }

  if (data.emdReturnCollectionDate) {
    tasks.push({
      sourceEventKey: "emd_return",
      title: `EMD return collection — ${data.tenderName}`,
      description: `EMD return collection date for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.emdReturnCollectionDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      assignedToId: data.concernAuthorityId ?? null,
      priority: "MEDIUM",
    });
  }

  if (data.biddingLastDate) {
    tasks.push({
      sourceEventKey: "bidding_last",
      title: `Bidding last date — ${data.tenderName}`,
      description: `Last date for bidding for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.biddingLastDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      assignedToId: data.concernAuthorityId ?? null,
      priority: "HIGH",
    });
  }

  if (data.dateOfOpening) {
    tasks.push({
      sourceEventKey: "opening",
      title: `Tender opening date — ${data.tenderName}`,
      description: `Date of opening for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.dateOfOpening,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      assignedToId: data.concernAuthorityId ?? null,
      priority: "HIGH",
    });
  }

  if (data.preBidMeetingDate) {
    tasks.push({
      sourceEventKey: "pre_bid",
      title: `Pre-bid meeting — ${data.tenderName}`,
      description: `Pre-bid meeting for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.preBidMeetingDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      assignedToId: data.concernAuthorityId ?? null,
      priority: "MEDIUM",
    });
  }

  if (data.negotiationMeetingDate) {
    tasks.push({
      sourceEventKey: "negotiation",
      title: `Negotiation meeting — ${data.tenderName}`,
      description: `Negotiation meeting for tender "${data.tenderName}". Update to reminder/to-do list with concerned authority.`,
      dueDate: data.negotiationMeetingDate,
      sourceModule: "TENDER",
      sourceEntityId: data.tenderId,
      assignedToId: data.concernAuthorityId ?? null,
      priority: "MEDIUM",
    });
  }

  for (const task of tasks) {
    await createLinkedTask(task);
  }
}

// ─── In-Out Register Linking ───

interface InOutRegisterLinkData {
  inOutRegisterId: string;
  documentRefNo: string;
  direction?: string | null;
  inwardType?: string | null;
  details?: string | null;
  receivedDate?: Date | null;
  replyDueDate?: Date | null;
  actionSuggestedStaffId?: string | null;
  ccStaffIds?: string[];
}

export async function createInOutRegisterLinkedTasks(data: InOutRegisterLinkData): Promise<void> {
  const tasks: CreateLinkedTaskInput[] = [];
  // Excel gives no task deadline — prefer the real reply-due date,
  // then the received date, never an invented offset.
  const dueDate = data.replyDueDate ?? data.receivedDate ?? new Date();
  const dir = data.direction === "OUTWARD" ? "outward" : "inward";

  // "Action suggested to" is a register field, not an automatic task.
  // A HIGH-priority action task is only raised for inward documents
  // that actually require action — never for outward dispatches or
  // Informative inwards merely because a staff member is recorded.
  const actionTaskApplies =
    data.actionSuggestedStaffId &&
    data.direction !== "OUTWARD" &&
    data.inwardType !== "INFORMATIVE";
  if (actionTaskApplies) {
    tasks.push({
      sourceEventKey: `action:${data.actionSuggestedStaffId}`,
      title: `Action required: Doc #${data.documentRefNo}`,
      description: data.details
        ? `Inward doc #${data.documentRefNo}: ${data.details}`
        : `Action required for inward document #${data.documentRefNo}.`,
      dueDate,
      sourceModule: "IN_OUT_REGISTER",
      sourceEntityId: data.inOutRegisterId,
      assignedToId: data.actionSuggestedStaffId,
      priority: "HIGH",
    });
  }

  if (data.ccStaffIds && data.ccStaffIds.length > 0) {
    for (const staffId of data.ccStaffIds) {
      if (staffId !== data.actionSuggestedStaffId || !actionTaskApplies) {
        tasks.push({
          sourceEventKey: `cc:${staffId}`,
          title: `CC Notification: Doc #${data.documentRefNo}`,
          description: data.details
            ? `CC marking on ${dir} doc #${data.documentRefNo}: ${data.details}`
            : `You have been marked CC on ${dir} document #${data.documentRefNo}.`,
          dueDate,
          sourceModule: "IN_OUT_REGISTER",
          sourceEntityId: data.inOutRegisterId,
          assignedToId: staffId,
          priority: "LOW",
        });
      }
    }
  }

  for (const task of tasks) {
    await createLinkedTask(task);
  }
}


// ─── Payment Schedule Linking ───

const PAYMENT_SCHEDULE_SOURCE = "PAYMENT_SCHEDULE";

interface PaymentScheduleLinkData {
  scheduleId: string;
  paymentType?: string | null;
  category: string;
  detail?: string | null;
  amount?: string | null;
  dueDate: Date;
  assignedToId: string;
  assignedById?: string | null;
}

/**
 * Creates the single follow-up task for a payment schedule.
 * At most one task per schedule — deduplicated on sourceModule +
 * sourceEntityId only (title changes must not create duplicates).
 * Returns the task id (existing or new), or null if none created.
 */
export async function createPaymentScheduleLinkedTask(
  data: PaymentScheduleLinkData
): Promise<string | null> {
  const existing = await prisma.task.findFirst({
    where: {
      sourceModule: PAYMENT_SCHEDULE_SOURCE,
      sourceEntityId: data.scheduleId,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const what =
    data.paymentType ??
    data.category.toLowerCase().replace(/_/g, " ");
  const task = await prisma.task.create({
    data: {
      title: `Payment due — ${what}`,
      description: [
        `Scheduled payment of ${data.amount ?? "the recorded amount"} (${what}).`,
        data.detail ? `Detail: ${data.detail}` : null,
        "Check and follow up this scheduled payment before its due date.",
      ]
        .filter(Boolean)
        .join(" "),
      dueDate: data.dueDate,
      sourceModule: PAYMENT_SCHEDULE_SOURCE,
      sourceEntityId: data.scheduleId,
      sourceEventKey: "follow_up",
      projectId: null,
      assignedToId: data.assignedToId,
      assignedById: data.assignedById ?? null,
      priority: "HIGH",
    },
  });
  return task.id;
}

/**
 * Keeps the linked task's due date in sync when the schedule's due
 * date changes. Updates ONLY dueDate — task status, description,
 * progress and assignment are never touched.
 */
export type PaymentScheduleSyncResult =
  | "synced" // task due date updated to match the schedule
  | "kept-manual" // employee changed the task deadline — preserved
  | "closed" // task COMPLETED/CANCELLED — never touched
  | "none"; // no linked task exists

/**
 * Synchronizes the linked task's due date ONLY when demonstrably safe:
 * the task's current dueDate must still equal the schedule's previous
 * dueDate (employee has not edited it) and the task must not be
 * completed or cancelled. Task status, description, progress and
 * assignment are never touched.
 */
export async function syncPaymentScheduleTaskDueDate(
  scheduleId: string,
  dueDate: Date,
  expectedCurrentDueDate: Date | null
): Promise<{ status: PaymentScheduleSyncResult; taskId: string | null }> {
  const task = await prisma.task.findFirst({
    where: {
      sourceModule: PAYMENT_SCHEDULE_SOURCE,
      sourceEntityId: scheduleId,
    },
    select: { id: true, dueDate: true, status: true },
  });
  if (!task) return { status: "none", taskId: null };
  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    return { status: "closed", taskId: task.id };
  }
  const taskTime = task.dueDate ? task.dueDate.getTime() : null;
  const expectedTime = expectedCurrentDueDate
    ? expectedCurrentDueDate.getTime()
    : null;
  if (taskTime !== expectedTime) {
    return { status: "kept-manual", taskId: task.id };
  }
  await prisma.task.update({
    where: { id: task.id },
    data: { dueDate },
  });
  return { status: "synced", taskId: task.id };
}

/** Alerts every active ADMIN when a linked task can't be created because
 *  no responsible person is resolvable — keeps the omission visible. */
async function notifyAdminsOfUnassignedLinkedTask(
  input: CreateLinkedTaskInput
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return;
  const message =
    `A follow-up task "${input.title}" for ${input.sourceModule}` +
    ` record ${input.sourceEntityId}` +
    (input.sourceEventKey ? ` (event: ${input.sourceEventKey})` : "") +
    ` was not created because no responsible person is assigned. ` +
    `Assign a coordinator or responsible staff member on the source record.`;
  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: "CUSTOM",
        module: input.sourceModule.toLowerCase(),
        entityId: input.sourceEntityId,
        entityName: input.title,
        title: "Follow-up task not created — no assignee",
        message,
        priority: "MEDIUM",
      },
    });
  }
}

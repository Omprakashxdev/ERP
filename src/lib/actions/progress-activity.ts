"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma, ProgressActivityStatus } from "@prisma/client";
import {
  progressTemplateCreateSchema,
  progressTemplateUpdateSchema,
  progressTemplateItemCreateSchema,
  progressTemplateItemUpdateSchema,
  progressChecklistAssignSchema,
  progressActivityTransitionSchema,
  ProgressTemplateCreateInput,
  ProgressTemplateUpdateInput,
  ProgressTemplateItemCreateInput,
  ProgressTemplateItemUpdateInput,
  ProgressChecklistAssignInput,
  ProgressActivityTransitionInput,
} from "@/lib/schemas/progress-activity";
import { cuid } from "@/lib/schemas/shared";
import { rollupRooms, rollupByKey, ScopedRoom } from "@/lib/progress-rollup";
import { roomsInScope } from "@/lib/progress-scopes";
import { applyActivityStatusTransition } from "@/lib/progress-transition";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

const RESOURCE = "progressApp";
const BASE = "/dashboard/progress-app";

type Scope =
  | { siteId: string }
  | { wingId: string }
  | { floorId: string }
  | { flatId: string }
  | { roomId: string };

/* ─────────────────────────── Templates ─────────────────────────── */

export async function getProgressTemplates(): Promise<
  ActionResult<unknown[]>
> {
  return withPermission(RESOURCE, "read", async () => {
    return prisma.progressActivityTemplate.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            items: { where: { isActive: true } },
            checklists: { where: { isActive: true } },
          },
        },
      },
    });
  });
}

export async function getProgressTemplateById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission(RESOURCE, "read", async () => {
    return prisma.progressActivityTemplate.findUnique({
      where: { id },
      include: {
        items: { orderBy: [{ displayOrder: "asc" }, { activityName: "asc" }] },
        checklists: {
          where: { isActive: true },
          include: {
            room: {
              select: {
                id: true,
                roomName: true,
                flat: {
                  select: {
                    flatNumber: true,
                    floor: {
                      select: {
                        floorIdentifier: true,
                        wing: {
                          select: {
                            code: true,
                            site: { select: { siteName: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            _count: { select: { activities: true } },
          },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
  });
}

export async function createProgressTemplate(
  input: ProgressTemplateCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "create", async (user) => {
    const parsed = progressTemplateCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const template = await prisma.progressActivityTemplate.create({
      data: { ...parsed, createdById: user.id },
      select: { id: true },
    });

    await audit(user.id, "create", "ProgressActivityTemplate", template.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/templates`);
    return template;
  });
}

export async function updateProgressTemplate(
  input: ProgressTemplateUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = progressTemplateUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.progressActivityTemplate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new Error("Template not found.");

    await prisma.progressActivityTemplate.update({ where: { id }, data });

    await audit(user.id, "update", "ProgressActivityTemplate", id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/templates`);
    revalidatePath(`${BASE}/templates/${id}`);
    return { id };
  });
}

export async function setProgressTemplateActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = cuid.parse(id);
    if (typeof isActive !== "boolean") {
      throw new Error("isActive must be a boolean.");
    }
    await checkRateLimit(user.id);

    const existing = await prisma.progressActivityTemplate.findUnique({
      where: { id: parsedId },
      select: { id: true, isActive: true },
    });
    if (!existing) throw new Error("Template not found.");
    if (existing.isActive === isActive) return { id: parsedId };

    await prisma.progressActivityTemplate.update({
      where: { id: parsedId },
      data: { isActive },
    });

    await audit(
      user.id,
      isActive ? "activate" : "deactivate",
      "ProgressActivityTemplate",
      parsedId
    );
    revalidatePath(`${BASE}/templates`);
    revalidatePath(`${BASE}/templates/${parsedId}`);
    return { id: parsedId };
  });
}

/* ───────────────────────── Template items ──────────────────────── */

async function bumpTemplateVersion(
  tx: Prisma.TransactionClient,
  templateId: string
) {
  await tx.progressActivityTemplate.update({
    where: { id: templateId },
    data: { version: { increment: 1 } },
  });
}

export async function createProgressTemplateItem(
  input: ProgressTemplateItemCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = progressTemplateItemCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const item = await prisma.$transaction(async (tx) => {
      const template = await tx.progressActivityTemplate.findUnique({
        where: { id: parsed.templateId },
        select: { id: true, isActive: true },
      });
      if (!template) throw new Error("Template not found.");
      if (!template.isActive) {
        throw new Error("Cannot add activities to an inactive template.");
      }

      // default to the end of the list when no order given
      if (!parsed.displayOrder) {
        const last = await tx.progressActivityTemplateItem.findFirst({
          where: { templateId: parsed.templateId },
          orderBy: { displayOrder: "desc" },
          select: { displayOrder: true },
        });
        parsed.displayOrder = (last?.displayOrder ?? -1) + 1;
      }

      const created = await tx.progressActivityTemplateItem.create({
        data: parsed,
        select: { id: true },
      });
      await bumpTemplateVersion(tx, parsed.templateId);
      return created;
    });

    await audit(user.id, "create", "ProgressActivityTemplateItem", item.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/templates/${parsed.templateId}`);
    return item;
  });
}

export async function updateProgressTemplateItem(
  input: ProgressTemplateItemUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = progressTemplateItemUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const item = await prisma.$transaction(async (tx) => {
      const existing = await tx.progressActivityTemplateItem.findUnique({
        where: { id },
        select: { id: true, templateId: true },
      });
      if (!existing) throw new Error("Activity not found.");

      await tx.progressActivityTemplateItem.update({
        where: { id },
        data,
      });
      await bumpTemplateVersion(tx, existing.templateId);
      return existing;
    });

    await audit(user.id, "update", "ProgressActivityTemplateItem", id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/templates/${item.templateId}`);
    return { id };
  });
}

export async function setProgressTemplateItemActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = cuid.parse(id);
    if (typeof isActive !== "boolean") {
      throw new Error("isActive must be a boolean.");
    }
    await checkRateLimit(user.id);

    const item = await prisma.$transaction(async (tx) => {
      const existing = await tx.progressActivityTemplateItem.findUnique({
        where: { id: parsedId },
        select: { id: true, templateId: true, isActive: true },
      });
      if (!existing) throw new Error("Activity not found.");
      if (existing.isActive === isActive) return existing;

      await tx.progressActivityTemplateItem.update({
        where: { id: parsedId },
        data: { isActive },
      });
      await bumpTemplateVersion(tx, existing.templateId);
      return existing;
    });

    await audit(
      user.id,
      isActive ? "activate" : "deactivate",
      "ProgressActivityTemplateItem",
      parsedId
    );
    revalidatePath(`${BASE}/templates/${item.templateId}`);
    return { id: parsedId };
  });
}

export async function moveProgressTemplateItem(
  id: string,
  direction: "up" | "down"
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsedId = cuid.parse(id);
    if (direction !== "up" && direction !== "down") {
      throw new Error("direction must be up or down.");
    }
    await checkRateLimit(user.id);

    await prisma.$transaction(async (tx) => {
      const items = await tx.progressActivityTemplateItem.findMany({
        where: {
          templateId: (
            await tx.progressActivityTemplateItem.findUniqueOrThrow({
              where: { id: parsedId },
              select: { templateId: true },
            })
          ).templateId,
        },
        orderBy: [{ displayOrder: "asc" }, { activityName: "asc" }],
        select: { id: true, displayOrder: true, templateId: true },
      });
      const idx = items.findIndex((i) => i.id === parsedId);
      if (idx === -1) throw new Error("Activity not found.");
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= items.length) return;

      // normalize to dense order values, then swap
      for (let i = 0; i < items.length; i++) {
        const order = i === idx ? swapIdx : i === swapIdx ? idx : i;
        if (items[i].displayOrder !== order) {
          await tx.progressActivityTemplateItem.update({
            where: { id: items[i].id },
            data: { displayOrder: order },
          });
        }
      }
      await bumpTemplateVersion(tx, items[idx].templateId);
    });

    await audit(user.id, "reorder", "ProgressActivityTemplateItem", parsedId, {
      direction,
    });
    return { id: parsedId };
  });
}

/* ─────────────────────── Checklist assignment ──────────────────── */

/**
 * Assigning a template to a room creates an immutable snapshot: template
 * items are copied into ProgressRoomActivity rows at assignment time.
 * Editing the master template afterwards can never alter existing room
 * activities. Replacing a room's checklist deactivates the old one —
 * its activity rows and history are preserved (never deleted).
 */
export async function assignRoomChecklist(
  input: ProgressChecklistAssignInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission(RESOURCE, "create", async (user) => {
    const parsed = progressChecklistAssignSchema.parse(input);
    await checkRateLimit(user.id);

    const checklist = await prisma.$transaction(async (tx) => {
      const room = await tx.progressRoom.findUnique({
        where: { id: parsed.roomId },
        select: {
          id: true,
          flatId: true,
          isActive: true,
          flat: {
            select: {
              isActive: true,
              floor: {
                select: {
                  isActive: true,
                  wing: {
                    select: {
                      isActive: true,
                      site: { select: { status: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!room) throw new Error("Room not found.");
      if (!room.isActive) throw new Error("This room has been deactivated.");
      if (!room.flat.isActive) {
        throw new Error("The parent flat has been deactivated.");
      }
      if (!room.flat.floor.isActive) {
        throw new Error("The parent floor has been deactivated.");
      }
      if (!room.flat.floor.wing.isActive) {
        throw new Error("The parent wing has been deactivated.");
      }
      if (room.flat.floor.wing.site.status === "ARCHIVED") {
        throw new Error("The site has been archived.");
      }

      const template = await tx.progressActivityTemplate.findUnique({
        where: { id: parsed.templateId },
        select: {
          id: true,
          isActive: true,
          version: true,
          items: {
            where: { isActive: true },
            orderBy: [{ displayOrder: "asc" }, { activityName: "asc" }],
            select: {
              id: true,
              activityName: true,
              description: true,
              displayOrder: true,
            },
          },
        },
      });
      if (!template) throw new Error("Template not found.");
      if (!template.isActive) {
        throw new Error("Cannot assign an inactive template.");
      }
      if (template.items.length === 0) {
        throw new Error("Template has no active activities.");
      }

      // single-active-checklist invariant — deactivate any current one
      await tx.progressRoomChecklist.updateMany({
        where: { roomId: parsed.roomId, isActive: true },
        data: { isActive: false },
      });

      // The partial unique index ProgressRoomChecklist_one_active_per_room
      // guarantees only one active checklist can ever exist per room — a
      // concurrent assign/replace that loses the race fails here and the
      // whole transaction rolls back.
      const created = await tx.progressRoomChecklist
        .create({
          data: {
            roomId: parsed.roomId,
            templateId: template.id,
            templateVersion: template.version,
            assignedById: user.id,
          },
          select: { id: true },
        })
        .catch((e) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            throw new Error(
              "A concurrent checklist assignment already made this room's checklist active. Reload and retry."
            );
          }
          throw e;
        });

      await tx.progressRoomActivity.createMany({
        data: template.items.map((item, idx) => ({
          roomChecklistId: created.id,
          sourceTemplateItemId: item.id,
          activityNameSnapshot: item.activityName,
          descriptionSnapshot: item.description,
          displayOrder: idx,
          status: ProgressActivityStatus.NOT_STARTED,
        })),
      });

      return created;
    });

    await audit(user.id, "assign", "ProgressRoomChecklist", checklist.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });
    revalidatePath(`${BASE}/rooms/${parsed.roomId}`);
    return checklist;
  });
}

/** Preview shown before replacing a room's checklist. */
export async function getChecklistAssignmentPreview(
  roomId: string,
  templateId: string
): Promise<
  ActionResult<{
    currentTemplateName: string | null;
    currentTotal: number;
    currentCompleted: number;
    newTemplateName: string;
    newActivityCount: number;
  } | null>
> {
  return withPermission(RESOURCE, "read", async () => {
    const parsedRoom = cuid.parse(roomId);
    const parsedTemplate = cuid.parse(templateId);

    const [current, template] = await Promise.all([
      prisma.progressRoomChecklist.findFirst({
        where: { roomId: parsedRoom, isActive: true },
        select: {
          template: { select: { name: true } },
          _count: { select: { activities: true } },
        },
      }),
      prisma.progressActivityTemplate.findUnique({
        where: { id: parsedTemplate },
        select: {
          name: true,
          _count: { select: { items: { where: { isActive: true } } } },
        },
      }),
    ]);
    if (!template) throw new Error("Template not found.");

    let completed = 0;
    if (current) {
      completed = await prisma.progressRoomActivity.count({
        where: {
          roomChecklist: { roomId: parsedRoom, isActive: true },
          status: ProgressActivityStatus.COMPLETED,
          isActive: true,
        },
      });
    }

    return {
      currentTemplateName: current?.template.name ?? null,
      currentTotal: current?._count.activities ?? 0,
      currentCompleted: completed,
      newTemplateName: template.name,
      newActivityCount: template._count.items,
    };
  });
}

/* ─────────────────────────── Room reads ────────────────────────── */

export async function getProgressRoomById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission(RESOURCE, "read", async () => {
    return prisma.progressRoom.findUnique({
      where: { id },
      include: {
        flat: {
          select: {
            id: true,
            flatNumber: true,
            flatType: true,
            floor: {
              select: {
                id: true,
                floorIdentifier: true,
                displayName: true,
                wing: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    site: {
                      select: { id: true, siteCode: true, siteName: true },
                    },
                  },
                },
              },
            },
          },
        },
        checklists: {
          where: { isActive: true },
          take: 1,
          include: {
            template: { select: { id: true, name: true, version: true } },
            assignedBy: { select: { name: true, email: true } },
            activities: {
              orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
              select: {
                id: true,
                activityNameSnapshot: true,
                descriptionSnapshot: true,
                displayOrder: true,
                status: true,
                revision: true,
                updatedAt: true,
                _count: { select: { history: true } },
              },
            },
          },
        },
      },
    });
  });
}

/* ─────────────────────── Progress rollups ──────────────────────── */

export async function getScopeProgress(
  scope: Scope
): Promise<ActionResult<unknown>> {
  return withPermission(RESOURCE, "read", async () => {
    return rollupRooms(await roomsInScope(scope));
  });
}

/** Progress per direct child of a parent node (for list columns). */
export async function getChildrenProgress(
  kind: "wing" | "floor" | "flat" | "room",
  parentId: string
): Promise<ActionResult<Record<string, unknown>>> {
  return withPermission(RESOURCE, "read", async () => {
    let scope: Scope;
    let keyFor: (r: ScopedRoom) => string;
    if (kind === "wing") {
      scope = { siteId: parentId };
      keyFor = (r) => r.flat.floor.wingId;
    } else if (kind === "floor") {
      scope = { wingId: parentId };
      keyFor = (r) => r.flat.floorId;
    } else if (kind === "flat") {
      scope = { floorId: parentId };
      keyFor = (r) => r.flatId;
    } else {
      scope = { flatId: parentId };
      keyFor = (r) => r.id;
    }
    const map = rollupByKey(await roomsInScope(scope), keyFor);
    return Object.fromEntries(map);
  });
}

/* ─────────────────────── Status transition ─────────────────────── */

export interface TransitionResult {
  id: string;
  status: ProgressActivityStatus;
  revision: number;
  alreadyApplied: boolean;
}

/**
 * Server-authoritative status transition service. This is the ONLY write
 * path for activity progress — it enforces the authorization boundary,
 * optimistic revision checks, atomic status+history writes, idempotent
 * event replay, and per-user attribution. There is deliberately no ERP
 * UI calling it; the Android API will authenticate field users and call
 * this service, and integration tests exercise it directly.
 */
export async function transitionRoomActivityStatus(
  input: ProgressActivityTransitionInput
): Promise<ActionResult<TransitionResult>> {
  return withPermission(RESOURCE, "update", async (user) => {
    const parsed = progressActivityTransitionSchema.parse(input);
    await checkRateLimit(user.id);

    const result = await applyActivityStatusTransition(user.id, parsed);

    await audit(user.id, "status-change", "ProgressRoomActivity", result.id, {
      status: parsed.status,
      eventId: parsed.eventId,
      alreadyApplied: result.alreadyApplied,
    });
    revalidatePath(`${BASE}/rooms`);
    return result;
  });
}

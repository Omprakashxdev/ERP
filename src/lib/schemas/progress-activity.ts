import { z } from "zod";
import { ProgressActivityStatus } from "@prisma/client";
import { cleanedString, cuid } from "./shared";

/* ─────────────────────────── Templates ─────────────────────────── */

export const progressTemplateCreateSchema = z.object({
  name: cleanedString(120),
  description: cleanedString(500).optional().nullable(),
});

export const progressTemplateUpdateSchema = progressTemplateCreateSchema
  .partial()
  .extend({ id: cuid });

const displayOrderSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (value === "" ? 0 : Number(value)))
  .pipe(z.number().int("Display order must be a whole number").min(0).max(9999))
  .default(0);

/* ───────────────────────── Template items ──────────────────────── */

export const progressTemplateItemCreateSchema = z.object({
  templateId: cuid,
  activityName: cleanedString(120),
  description: cleanedString(300).optional().nullable(),
  displayOrder: displayOrderSchema,
});

export const progressTemplateItemUpdateSchema =
  progressTemplateItemCreateSchema
    .omit({ templateId: true })
    .partial()
    .extend({ id: cuid });

/* ─────────────────────── Checklist assignment ──────────────────── */

export const progressChecklistAssignSchema = z.object({
  roomId: cuid,
  templateId: cuid,
});

/* ─────────────────────── Status transitions ────────────────────── */

export const progressActivityTransitionSchema = z.object({
  roomActivityId: cuid,
  status: z.nativeEnum(ProgressActivityStatus),
  // Optimistic concurrency token — caller must supply the revision they
  // last observed; the server rejects the write if it has moved on.
  expectedRevision: z.number().int().min(0),
  // Idempotency key — replays of the same eventId return success without
  // double-applying the transition.
  eventId: z.string().min(8).max(80),
  notes: cleanedString(500).optional().nullable(),
});

export type ProgressTemplateCreateInput = z.input<
  typeof progressTemplateCreateSchema
>;
export type ProgressTemplateUpdateInput = z.input<
  typeof progressTemplateUpdateSchema
>;
export type ProgressTemplateItemCreateInput = z.input<
  typeof progressTemplateItemCreateSchema
>;
export type ProgressTemplateItemUpdateInput = z.input<
  typeof progressTemplateItemUpdateSchema
>;
export type ProgressChecklistAssignInput = z.input<
  typeof progressChecklistAssignSchema
>;
export type ProgressActivityTransitionInput = z.input<
  typeof progressActivityTransitionSchema
>;

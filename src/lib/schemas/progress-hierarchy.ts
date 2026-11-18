import { z } from "zod";
import { cleanedString, cuid } from "./shared";
import { sanitizeInput } from "@/lib/sanitize";

// Hierarchy identifiers (wing code, floor identifier, flat number) are
// normalized to uppercase so the parent-scoped unique constraints are
// effectively case-insensitive. Room names keep natural case — duplicates
// are checked case-insensitively at the application layer.
const identifierString = (max = 32, label = "identifier") =>
  z
    .string()
    .transform((value) => sanitizeInput(value).toUpperCase())
    .pipe(
      z
        .string()
        .min(1, `${label} is required`)
        .max(max, `${label} must be at most ${max} characters`)
        .regex(
          /^[A-Z0-9][A-Z0-9_\-. /]*$/,
          "Use letters, numbers, spaces, hyphens, underscores, dots or slashes"
        )
    );

const displayOrderSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (value === "" ? 0 : Number(value)))
  .pipe(z.number().int("Display order must be a whole number").min(0).max(9999))
  .default(0);

export const progressWingCreateSchema = z.object({
  siteId: cuid,
  code: identifierString(32, "Wing code"),
  name: cleanedString(200),
  description: cleanedString(500).optional().nullable(),
  displayOrder: displayOrderSchema,
});

// Identifier fields (code, floorIdentifier, flatNumber, roomName) are
// immutable after creation — they are the stable keys the parent-scoped
// unique constraints and the future Android API reference. Same
// convention as the immutable siteCode on ProgressSite.
export const progressWingUpdateSchema = progressWingCreateSchema
  .omit({ siteId: true, code: true })
  .partial()
  .extend({ id: cuid });

export const progressFloorCreateSchema = z.object({
  wingId: cuid,
  floorIdentifier: identifierString(32, "Floor identifier"),
  displayName: cleanedString(100).optional().nullable(),
  displayOrder: displayOrderSchema,
});

export const progressFloorUpdateSchema = progressFloorCreateSchema
  .omit({ wingId: true, floorIdentifier: true })
  .partial()
  .extend({ id: cuid });

export const progressFlatCreateSchema = z.object({
  floorId: cuid,
  flatNumber: identifierString(32, "Flat number"),
  flatType: cleanedString(60).optional().nullable(),
  displayOrder: displayOrderSchema,
});

export const progressFlatUpdateSchema = progressFlatCreateSchema
  .omit({ floorId: true, flatNumber: true })
  .partial()
  .extend({ id: cuid });

export const progressRoomCreateSchema = z.object({
  flatId: cuid,
  roomName: cleanedString(100),
  roomType: cleanedString(60).optional().nullable(),
  displayOrder: displayOrderSchema,
});

export const progressRoomUpdateSchema = progressRoomCreateSchema
  .omit({ flatId: true, roomName: true })
  .partial()
  .extend({ id: cuid });

export const hierarchyIdSchema = z.object({ id: cuid });

export type ProgressWingCreateInput = z.input<typeof progressWingCreateSchema>;
export type ProgressWingUpdateInput = z.input<typeof progressWingUpdateSchema>;
export type ProgressFloorCreateInput = z.input<typeof progressFloorCreateSchema>;
export type ProgressFloorUpdateInput = z.input<typeof progressFloorUpdateSchema>;
export type ProgressFlatCreateInput = z.input<typeof progressFlatCreateSchema>;
export type ProgressFlatUpdateInput = z.input<typeof progressFlatUpdateSchema>;
export type ProgressRoomCreateInput = z.input<typeof progressRoomCreateSchema>;
export type ProgressRoomUpdateInput = z.input<typeof progressRoomUpdateSchema>;

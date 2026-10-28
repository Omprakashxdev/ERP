import { z } from "zod";
import { ProgressSiteStatus } from "@prisma/client";
import { cleanedString, optionalCuid } from "./shared";
import { sanitizeInput } from "@/lib/sanitize";

export const siteCodeSchema = z
  .string()
  .transform((value) => sanitizeInput(value).toUpperCase())
  .pipe(
    z
      .string()
      .min(2, "Site code must be at least 2 characters")
      .max(32, "Site code must be at most 32 characters")
      .regex(
        /^[A-Z0-9][A-Z0-9_-]*$/,
        "Use letters, numbers, hyphens or underscores (e.g. SAEC-001)"
      )
  );

const emptyToNull = (value: unknown) =>
  value === "" || value === undefined ? null : value;

const latitudeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : emptyToNull(value)),
  z
    .number({ error: "Latitude must be a number" })
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90")
    .nullable()
    .optional()
);

const longitudeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : emptyToNull(value)),
  z
    .number({ error: "Longitude must be a number" })
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180")
    .nullable()
    .optional()
);

export const progressSiteCreateSchema = z.object({
  siteCode: siteCodeSchema,
  siteName: cleanedString(200),
  description: cleanedString(1000).optional().nullable(),
  address: cleanedString(500).optional().nullable(),
  city: cleanedString(100).optional().nullable(),
  state: cleanedString(100).optional().nullable(),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  locationNotes: cleanedString(500).optional().nullable(),
  status: z.nativeEnum(ProgressSiteStatus).default(ProgressSiteStatus.PLANNED),
  coverImagePath: cleanedString(500).optional().nullable(),
  projectId: optionalCuid,
});

// siteCode is immutable after creation — it is the stable identifier that
// the Android app and future hierarchy rows will reference.
export const progressSiteUpdateSchema = progressSiteCreateSchema
  .omit({ siteCode: true })
  .partial()
  .extend({ id: z.string().cuid("Invalid reference") });

export const progressSiteFilterSchema = z.object({
  search: z.string().optional(),
  status: z.nativeEnum(ProgressSiteStatus).optional(),
  includeArchived: z.boolean().optional(),
});

export type ProgressSiteCreateInput = z.input<typeof progressSiteCreateSchema>;
export type ProgressSiteUpdateInput = z.input<typeof progressSiteUpdateSchema>;
export type ProgressSiteFilterInput = z.input<typeof progressSiteFilterSchema>;

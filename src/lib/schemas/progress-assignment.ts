import { z } from "zod";
import { cuid } from "./shared";

/* ─────────────────── Site-staff assignments (Brick 4) ────────────────── */

const userIdSchema = z.string().min(1).max(80);

// canUpdate implies canView — a user who may post progress must be able to
// read the site first.
const scopeFields = z
  .object({
    canView: z.boolean(),
    canUpdate: z.boolean(),
  })
  .refine((d) => !d.canUpdate || d.canView, {
    message: "Update permission requires view permission.",
    path: ["canUpdate"],
  });

export const siteAssignmentGrantSchema = z
  .object({
    siteId: cuid,
    userId: userIdSchema,
  })
  .and(scopeFields);

export const siteAssignmentScopeSchema = z
  .object({
    assignmentId: cuid,
  })
  .and(scopeFields);

export type SiteAssignmentGrantInput = z.input<
  typeof siteAssignmentGrantSchema
>;
export type SiteAssignmentScopeInput = z.input<
  typeof siteAssignmentScopeSchema
>;

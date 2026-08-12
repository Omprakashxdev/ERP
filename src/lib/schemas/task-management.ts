import { z } from "zod";
import { cleanedString, cuid } from "./shared";

export const taskCreateSchema = z.object({
  title: cleanedString(200),
  description: cleanedString(2000).optional().nullable(),
  assignedToId: cuid,
  projectId: z.string().cuid().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  priority: z
    .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
    .default("MEDIUM"),
  department: cleanedString(100).optional().nullable(),
  reviewerId: z.string().cuid().optional().nullable(),
  percentageCompletion: z.number().int().min(0).max(100).optional(),
  sourceModule: cleanedString(50).optional().nullable(),
  sourceEntityId: z.string().cuid().optional().nullable(),
});

export const taskUpdateSchema = taskCreateSchema
  .partial()
  .extend({
    id: z.string().cuid(),
    status: z
      .enum([
        "OPEN",
        "IN_PROGRESS",
        "ON_HOLD",
        "PENDING_REVIEW",
        "COMPLETED",
        "CANCELLED",
      ])
      .optional(),
    reworkReason: cleanedString(500).optional().nullable(),
  });

export const taskFilterSchema = z.object({
  search: z.string().optional(),
  assignedToId: z.string().cuid().optional(),
  status: z
    .enum([
      "OPEN",
      "IN_PROGRESS",
      "ON_HOLD",
      "PENDING_REVIEW",
      "COMPLETED",
      "CANCELLED",
    ])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  projectId: z.string().cuid().optional(),
  overdue: z.enum(["true", "false"]).optional(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type TaskFilterInput = z.infer<typeof taskFilterSchema>;

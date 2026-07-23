import { z } from "zod";
import { cleanedString, cuid } from "./shared";

export const notificationRuleCreateSchema = z.object({
  name: cleanedString(100),
  type: z.enum([
    "DUE_DATE_REMINDER",
    "OVERDUE_PAYMENT",
    "PENDING_REPLY",
    "VEHICLE_DOC_EXPIRY",
    "DOCUMENT_EXPIRY",
    "CUSTOM",
  ]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  module: cleanedString(50),
  thresholdDays: z.coerce.number().int().min(1).max(365).default(7),
  cronExpression: cleanedString(100).optional().nullable(),
  enabled: z.boolean().default(true),
});

export const notificationRuleUpdateSchema = notificationRuleCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const notificationFilterSchema = z.object({
  isRead: z.enum(["true", "false"]).optional(),
  type: z
    .enum([
      "DUE_DATE_REMINDER",
      "OVERDUE_PAYMENT",
      "PENDING_REPLY",
      "VEHICLE_DOC_EXPIRY",
      "DOCUMENT_EXPIRY",
      "CUSTOM",
    ])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  module: z.string().optional(),
});

export const auditLogFilterSchema = z.object({
  search: z.string().optional(),
  userId: z.string().cuid().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type NotificationRuleCreateInput = z.infer<
  typeof notificationRuleCreateSchema
>;
export type NotificationRuleUpdateInput = z.infer<
  typeof notificationRuleUpdateSchema
>;
export type NotificationFilterInput = z.infer<typeof notificationFilterSchema>;
export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>;

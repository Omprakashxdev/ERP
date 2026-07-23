import { z } from "zod";

export const exportRequestSchema = z.object({
  module: z.enum([
    "fundFlow",
    "dueBills",
    "wip",
    "contractors",
    "tenders",
    "paymentSchedules",
    "vehicleLogBook",
    "assets",
    "inOutRegister",
    "auditLogs",
    "tadaBills",
    "tasks",
  ]),
  format: z.enum(["csv", "json", "xlsx"]),
});

export const importRequestSchema = z.object({
  module: z.enum([
    "fundFlow",
    "dueBills",
    "wip",
    "contractors",
    "tenders",
    "paymentSchedules",
    "vehicleLogBook",
    "assets",
    "inOutRegister",
    "tadaBills",
    "tasks",
  ]),
  format: z.enum(["csv", "json"]),
  data: z.string().min(1),
});

export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
export type ImportRequestInput = z.infer<typeof importRequestSchema>;

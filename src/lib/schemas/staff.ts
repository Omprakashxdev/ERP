import { z } from "zod";
import { cleanedString, optionalCuid } from "./shared";

export const staffCreateSchema = z.object({
  name: cleanedString(120),
  email: z.string().email().optional().nullable(),
  phone: cleanedString(20).optional().nullable(),
  employeeCode: cleanedString(30).optional().nullable(),
  designation: cleanedString(60).optional().nullable(),
  regionId: optionalCuid,
  isActive: z.boolean().default(true),
});

export const staffUpdateSchema = staffCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const staffFilterSchema = z.object({
  search: z.string().optional(),
  regionId: z.string().cuid().optional(),
  isActive: z.boolean().optional(),
});

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type StaffFilterInput = z.infer<typeof staffFilterSchema>;

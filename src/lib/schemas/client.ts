import { z } from "zod";
import { cleanedString, optionalCuid } from "./shared";

export const clientContactSchema = z.object({
  id: optionalCuid,
  name: cleanedString(120),
  email: z.string().email().optional().nullable(),
  phone: cleanedString(20).optional().nullable(),
});

export const clientCreateSchema = z.object({
  name: cleanedString(200),
  abbreviation: cleanedString(8).optional().nullable(),
  address: cleanedString(500).optional().nullable(),
  contacts: z.array(clientContactSchema).optional(),
});

export const clientUpdateSchema = clientCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const clientFilterSchema = z.object({
  search: z.string().optional(),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type ClientFilterInput = z.infer<typeof clientFilterSchema>;

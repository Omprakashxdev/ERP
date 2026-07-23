import { z } from "zod";
import { cleanedString } from "./shared";

export const regionCreateSchema = z.object({
  name: cleanedString(120),
  abbreviation: cleanedString(20).optional().nullable(),
  address: cleanedString(500).optional().nullable(),
});

export const regionUpdateSchema = regionCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const regionFilterSchema = z.object({
  search: z.string().optional(),
});

export type RegionCreateInput = z.infer<typeof regionCreateSchema>;
export type RegionUpdateInput = z.infer<typeof regionUpdateSchema>;
export type RegionFilterInput = z.infer<typeof regionFilterSchema>;

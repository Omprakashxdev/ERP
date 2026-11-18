import { z } from "zod";
import { ProgressActivityStatus, ProgressPhotoTargetType } from "@prisma/client";
import { cleanedString, cuid } from "./shared";

/* ───────────────── Mobile API request schemas (Brick 4) ─────────────── */

export const mobileLoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(128),
  deviceLabel: z.string().max(120).optional(),
});

export const mobileRefreshSchema = z.object({
  refreshToken: z.string().min(16).max(512),
  deviceLabel: z.string().max(120).optional(),
});

export const mobileLogoutSchema = z.object({
  refreshToken: z.string().min(16).max(512),
});

export const mobileStatusUpdateSchema = z.object({
  status: z.nativeEnum(ProgressActivityStatus),
  expectedRevision: z.number().int().min(0),
  eventId: z.string().min(8).max(80),
  note: cleanedString(500).optional().nullable(),
});

export const photoTargetSchema = z.object({
  targetType: z.nativeEnum(ProgressPhotoTargetType),
  targetId: cuid,
});

export const photoListQuerySchema = z.object({
  targetType: z.nativeEnum(ProgressPhotoTargetType).optional(),
  targetId: cuid.optional(),
  siteId: cuid.optional(),
});

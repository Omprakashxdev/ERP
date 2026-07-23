import { z } from "zod";
import { TenderStatus, WorkType, ServiceType } from "@prisma/client";
import { cleanedString, money } from "./shared";

export const tenderCreateSchema = z.object({
  status: z.nativeEnum(TenderStatus).default(TenderStatus.UNDER_PREPARATION),
  tenderDate: z.coerce.date().optional(),
  name: cleanedString(255),
  tenderId: cleanedString(120).optional().nullable(),
  department: cleanedString(255).optional().nullable(),
  state: cleanedString(120).optional().nullable(),
  city: cleanedString(120).optional().nullable(),
  platform: cleanedString(120).optional().nullable(),

  workName: cleanedString(255).optional().nullable(),
  workType: z.nativeEnum(WorkType).optional().nullable(),
  serviceType: z.nativeEnum(ServiceType).optional().nullable(),

  preBidMeetingDate: z.coerce.date().optional().nullable(),
  preBidMeetingAttended: z.boolean().default(false),
  biddingLastDate: z.coerce.date().optional().nullable(),
  dateOfOpening: z.coerce.date().optional().nullable(),

  tenderFeeAmount: money.optional().nullable(),
  tenderFeeDate: z.coerce.date().optional().nullable(),
  tenderFeeMode: cleanedString(40).optional().nullable(),

  emdAmount: money.optional().nullable(),
  emdDate: z.coerce.date().optional().nullable(),
  emdMode: cleanedString(40).optional().nullable(),
  emdReturnCollectionDate: z.coerce.date().optional().nullable(),

  l1ContractorName: cleanedString(200).optional().nullable(),
  l1City: cleanedString(120).optional().nullable(),
  l1Amount: money.optional().nullable(),

  l2ContractorName: cleanedString(200).optional().nullable(),
  l2City: cleanedString(120).optional().nullable(),
  l2Amount: money.optional().nullable(),

  l3ContractorName: cleanedString(200).optional().nullable(),
  l3City: cleanedString(120).optional().nullable(),
  l3Amount: money.optional().nullable(),

  negotiationMeeting: cleanedString(1000).optional().nullable(),

  advertisementCopyPath: cleanedString(500).optional().nullable(),
  remarks: cleanedString(1000).optional().nullable(),
});

export const tenderUpdateSchema = tenderCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const tenderFilterSchema = z.object({
  search: z.string().optional(),
  status: z.nativeEnum(TenderStatus).optional(),
  workType: z.nativeEnum(WorkType).optional(),
  serviceType: z.nativeEnum(ServiceType).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  platform: z.string().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export type TenderCreateInput = z.infer<typeof tenderCreateSchema>;
export type TenderUpdateInput = z.infer<typeof tenderUpdateSchema>;
export type TenderFilterInput = z.infer<typeof tenderFilterSchema>;

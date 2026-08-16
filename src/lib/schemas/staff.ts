import { z } from "zod";
import { cleanedString, optionalCuid } from "./shared";

export const staffCreateSchema = z.object({
  name: cleanedString(120),
  email: z.string().email().optional().nullable(),
  phone: cleanedString(20).optional().nullable(),
  employeeCode: cleanedString(30).optional().nullable(),
  designation: cleanedString(60).optional().nullable(),
  regionId: optionalCuid,
  reportingManagerId: optionalCuid,
  isActive: z.boolean().default(true),

  // HR Employee Details (from H R gr)
  department: cleanedString(100).optional().nullable(),
  alternatePhone: cleanedString(20).optional().nullable(),
  presentCity: cleanedString(100).optional().nullable(),
  dateOfJoining: z.coerce.date().optional().nullable(),
  dateOfExit: z.coerce.date().optional().nullable(),

  fatherName: cleanedString(100).optional().nullable(),
  motherName: cleanedString(100).optional().nullable(),
  permanentAddress: cleanedString(500).optional().nullable(),
  communicationAddress: cleanedString(500).optional().nullable(),
  dateOfBirth: z.coerce.date().optional().nullable(),
  nationality: cleanedString(50).optional().nullable(),
  religionCaste: cleanedString(100).optional().nullable(),
  maritalStatus: cleanedString(50).optional().nullable(),

  passOutYear: z.coerce.number().int().min(1950).max(2035).optional().nullable(),
  otherQualification: cleanedString(200).optional().nullable(),
  otherPassOutYear: z.coerce.number().int().min(1950).max(2035).optional().nullable(),

  interviewFormPath: cleanedString(500).optional().nullable(),
  resumePath: cleanedString(500).optional().nullable(),
  photoIdProofPath: cleanedString(500).optional().nullable(),
  addressProofPath: cleanedString(500).optional().nullable(),
  degreeCertificatePath: cleanedString(500).optional().nullable(),
  letterOfGuaranteePath: cleanedString(500).optional().nullable(),
  officeTimeFramePath: cleanedString(500).optional().nullable(),
  dailyReportingPath: cleanedString(500).optional().nullable(),
  leavePolicyPath: cleanedString(500).optional().nullable(),
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


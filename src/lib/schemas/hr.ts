import { z } from "zod";
import { cleanedString, cuid } from "./shared";

export const employeeDetailCreateSchema = z.object({
  staffId: cuid,
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
  passOutYear: z.coerce.number().int().min(1950).max(2030).optional().nullable(),
  otherQualification: cleanedString(200).optional().nullable(),
  otherPassOutYear: z.coerce.number().int().min(1950).max(2030).optional().nullable(),
  interviewFormPath: cleanedString(500).optional().nullable(),
  resumePath: cleanedString(500).optional().nullable(),
  photoIdProofPath: cleanedString(500).optional().nullable(),
  addressProofPath: cleanedString(500).optional().nullable(),
  degreeCertificatePath: cleanedString(500).optional().nullable(),
  letterOfGuaranteePath: cleanedString(500).optional().nullable(),
});

export const employeeDetailUpdateSchema = employeeDetailCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const employeeFilterSchema = z.object({
  search: z.string().optional(),
  department: z.string().optional(),
  presentCity: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

export type EmployeeDetailCreateInput = z.infer<typeof employeeDetailCreateSchema>;
export type EmployeeDetailUpdateInput = z.infer<typeof employeeDetailUpdateSchema>;
export type EmployeeFilterInput = z.infer<typeof employeeFilterSchema>;

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Role } from "@/types/auth";
import {
  staffCreateSchema,
  staffUpdateSchema,
  staffFilterSchema,
  StaffCreateInput,
  StaffUpdateInput,
  StaffFilterInput,
} from "@/lib/schemas/staff";
import { withAuth, withPermission, checkRateLimit, audit, sanitizeForAudit, ActionResult } from "./wrapper";

const mutationRoles = [Role.ADMIN, Role.MANAGER];

async function generateEmployeeCode(): Promise<string> {
  const latestStaff = await prisma.staff.findFirst({
    where: { employeeCode: { startsWith: "EMP" } },
    orderBy: { employeeCode: "desc" },
  });

  if (!latestStaff || !latestStaff.employeeCode) {
    return "EMP001";
  }

  const match = latestStaff.employeeCode.match(/EMP(\d+)/);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return `EMP${String(num + 1).padStart(3, "0")}`;
  }

  return `EMP${Date.now().toString().slice(-6)}`;
}

export async function createStaff(
  input: StaffCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = staffCreateSchema.parse(input);
    await checkRateLimit(user.id);
    
    const code = parsed.employeeCode || (await generateEmployeeCode());

    const {
      name,
      email,
      phone,
      designation,
      regionId,
      reportingManagerId,
      isActive,
      ...detailFields
    } = parsed;

    const staff = await prisma.$transaction(async (tx) => {
      const created = await tx.staff.create({
        data: {
          name,
          email,
          phone,
          employeeCode: code,
          designation,
          regionId,
          reportingManagerId,
          isActive,
          employeeDetail: {
            create: {
              department: detailFields.department,
              alternatePhone: detailFields.alternatePhone,
              presentCity: detailFields.presentCity,
              dateOfJoining: detailFields.dateOfJoining,
              dateOfExit: detailFields.dateOfExit,
              fatherName: detailFields.fatherName,
              motherName: detailFields.motherName,
              permanentAddress: detailFields.permanentAddress,
              communicationAddress: detailFields.communicationAddress,
              dateOfBirth: detailFields.dateOfBirth,
              nationality: detailFields.nationality,
              religionCaste: detailFields.religionCaste,
              maritalStatus: detailFields.maritalStatus,
              passOutYear: detailFields.passOutYear,
              otherQualification: detailFields.otherQualification,
              otherPassOutYear: detailFields.otherPassOutYear,
              interviewFormPath: detailFields.interviewFormPath,
              resumePath: detailFields.resumePath,
              photoIdProofPath: detailFields.photoIdProofPath,
              addressProofPath: detailFields.addressProofPath,
              degreeCertificatePath: detailFields.degreeCertificatePath,
              letterOfGuaranteePath: detailFields.letterOfGuaranteePath,
              officeTimeFramePath: detailFields.officeTimeFramePath,
              dailyReportingPath: detailFields.dailyReportingPath,
              leavePolicyPath: detailFields.leavePolicyPath,
            },
          },
        },
        select: { id: true },
      });
      return created;
    });

    await audit(user.id, "create", "Staff", staff.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/settings");
    return staff;
  }, mutationRoles);
}

export async function updateStaff(
  input: StaffUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = staffUpdateSchema.parse(input);
    const {
      id,
      name,
      email,
      phone,
      employeeCode,
      designation,
      regionId,
      reportingManagerId,
      isActive,
      ...detailFields
    } = parsed;
    await checkRateLimit(user.id);

    const staffData: Record<string, unknown> = {};
    if (name !== undefined) staffData.name = name;
    if (email !== undefined) staffData.email = email;
    if (phone !== undefined) staffData.phone = phone;
    if (employeeCode !== undefined) staffData.employeeCode = employeeCode;
    if (designation !== undefined) staffData.designation = designation;
    if (regionId !== undefined) staffData.regionId = regionId;
    if (reportingManagerId !== undefined) staffData.reportingManagerId = reportingManagerId;
    if (isActive !== undefined) staffData.isActive = isActive;

    const detailData = {
      department: detailFields.department,
      alternatePhone: detailFields.alternatePhone,
      presentCity: detailFields.presentCity,
      dateOfJoining: detailFields.dateOfJoining,
      dateOfExit: detailFields.dateOfExit,
      fatherName: detailFields.fatherName,
      motherName: detailFields.motherName,
      permanentAddress: detailFields.permanentAddress,
      communicationAddress: detailFields.communicationAddress,
      dateOfBirth: detailFields.dateOfBirth,
      nationality: detailFields.nationality,
      religionCaste: detailFields.religionCaste,
      maritalStatus: detailFields.maritalStatus,
      passOutYear: detailFields.passOutYear,
      otherQualification: detailFields.otherQualification,
      otherPassOutYear: detailFields.otherPassOutYear,
      interviewFormPath: detailFields.interviewFormPath,
      resumePath: detailFields.resumePath,
      photoIdProofPath: detailFields.photoIdProofPath,
      addressProofPath: detailFields.addressProofPath,
      degreeCertificatePath: detailFields.degreeCertificatePath,
      letterOfGuaranteePath: detailFields.letterOfGuaranteePath,
      officeTimeFramePath: detailFields.officeTimeFramePath,
      dailyReportingPath: detailFields.dailyReportingPath,
      leavePolicyPath: detailFields.leavePolicyPath,
    };

    const staff = await prisma.$transaction(async (tx) => {
      const updated = await tx.staff.update({
        where: { id },
        data: {
          ...staffData,
          employeeDetail: {
            upsert: {
              create: detailData,
              update: detailData,
            },
          },
        },
        select: { id: true },
      });
      return updated;
    });

    await audit(user.id, "update", "Staff", staff.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/fund-flow");
    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/settings");
    return staff;
  }, mutationRoles);
}

export async function getStaff(
  filter?: StaffFilterInput,
  activeOnly?: boolean
): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    const parsed = filter ? staffFilterSchema.parse(filter) : undefined;
    const where: Record<string, unknown> = {};
    if (parsed?.search) {
      where.name = { contains: parsed.search, mode: "insensitive" };
    }
    if (parsed?.regionId) {
      where.regionId = parsed.regionId;
    }
    if (typeof parsed?.isActive === "boolean") {
      where.isActive = parsed.isActive;
    } else if (activeOnly !== false) {
      where.isActive = true;
    }

    const staff = await prisma.staff.findMany({
      where,
      include: {
        region: true,
        reportingManager: { select: { id: true, name: true, designation: true } },
        employeeDetail: true,
      },
      orderBy: { name: "asc" },
    });

    return staff;
  });
}

export async function getStaffById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withAuth(async () => {
    const staff = await prisma.staff.findUnique({
      where: { id },
      include: {
        region: true,
        reportingManager: { select: { id: true, name: true, designation: true } },
        subordinates: { select: { id: true, name: true, designation: true } },
        employeeDetail: true,
      },
    });
    return staff;
  });
}

export async function getReportingHierarchy(): Promise<ActionResult<unknown>> {
  return withAuth(async () => {
    const allStaff = await prisma.staff.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        designation: true,
        email: true,
        phone: true,
        employeeCode: true,
        regionId: true,
        region: { select: { name: true } },
        reportingManagerId: true,
      },
      orderBy: { name: "asc" },
    });

    const staffMap = new Map<string, typeof allStaff[number] & { children: unknown[] }>();
    for (const s of allStaff) {
      staffMap.set(s.id, { ...s, children: [] });
    }

    const roots: unknown[] = [];
    for (const s of allStaff) {
      const node = staffMap.get(s.id)!;
      if (s.reportingManagerId && staffMap.has(s.reportingManagerId)) {
        (staffMap.get(s.reportingManagerId)!.children as unknown[]).push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  });
}

export async function getReportingManager(
  staffId: string
): Promise<ActionResult<{ id: string; name: string; designation: string | null } | null>> {
  return withAuth(async () => {
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { reportingManagerId: true },
    });

    if (!staff?.reportingManagerId) return null;

    const manager = await prisma.staff.findUnique({
      where: { id: staff.reportingManagerId },
      select: { id: true, name: true, designation: true },
    });

    return manager;
  });
}

export async function updateReportingManager(
  staffId: string,
  reportingManagerId: string | null
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    await checkRateLimit(user.id);

    if (reportingManagerId === staffId) {
      throw new Error("Cannot set self as reporting manager");
    }

    if (reportingManagerId) {
      // Check for circular reference
      const visited = new Set<string>();
      let nextManager: string | null = reportingManagerId;
      while (nextManager) {
        const currentId: string = nextManager;
        if (currentId === staffId) {
          throw new Error("Circular reporting relationship detected");
        }
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const result = await prisma.staff.findUnique({
          where: { id: currentId },
          select: { reportingManagerId: true },
        });
        nextManager = result?.reportingManagerId ?? null;
      }
    }

    const updated = await prisma.staff.update({
      where: { id: staffId },
      data: { reportingManagerId },
      select: { id: true },
    });

    await audit(user.id, "update", "Staff", staffId, {
      field: "reportingManagerId",
      value: reportingManagerId,
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/settings");
    return updated;
  }, mutationRoles);
}

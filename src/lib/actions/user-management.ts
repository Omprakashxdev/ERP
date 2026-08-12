"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@/types/auth";
import { withAuth, audit, ActionResult } from "./wrapper";
import { checkRateLimit } from "./wrapper";

const mutationRoles = [Role.ADMIN];

// ─── Submit registration request (public, no auth required) ──────────

export async function submitRegistration(input: {
  name: string;
  email: string;
  password: string;
  employeeCode?: string;
  designation?: string;
  regionId?: string;
  reportingManagerId?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const email = input.email.toLowerCase().trim();
    const name = input.name.trim();

    if (!name || !email || !input.password) {
      return { success: false, error: "Name, email, and password are required." };
    }
    if (input.password.length < 8) {
      return { success: false, error: "Password must be at least 8 characters." };
    }

    // Check if email already exists as a user
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return { success: false, error: "An account with this email already exists." };
    }

    // Check if there's already a pending registration
    const existingReg = await prisma.registrationRequest.findUnique({ where: { email } });
    if (existingReg && existingReg.status === "PENDING") {
      return { success: false, error: "A registration request for this email is already pending approval." };
    }

    // If a rejected request exists, delete it so we can create a new one
    if (existingReg && existingReg.status === "REJECTED") {
      await prisma.registrationRequest.delete({ where: { id: existingReg.id } });
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);

    const registration = await prisma.registrationRequest.create({
      data: {
        name,
        email,
        hashedPassword,
        employeeCode: input.employeeCode?.trim() || null,
        designation: input.designation?.trim() || null,
        regionId: input.regionId || null,
        reportingManagerId: input.reportingManagerId || null,
      },
    });

    revalidatePath("/dashboard/settings");
    return { success: true, data: { id: registration.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to submit registration.";
    return { success: false, error: msg };
  }
}

// ─── Get pending registration requests ───────────────────────────────

export async function getPendingRegistrations(): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    return prisma.registrationRequest.findMany({
      where: { status: "PENDING" },
      include: {
        region: { select: { name: true } },
        reportingManager: { select: { name: true, designation: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });
}

// ─── Approve registration → create User + Staff ──────────────────────

export async function approveRegistration(
  registrationId: string,
  role: "ADMIN" | "MANAGER" | "STAFF" | "AUDITOR" = "STAFF"
): Promise<ActionResult<{ userId: string; staffId: string }>> {
  return withAuth(async (user) => {
    await checkRateLimit(user.id);

    const reg = await prisma.registrationRequest.findUnique({
      where: { id: registrationId },
    });

    if (!reg) {
      throw new Error("Registration request not found.");
    }
    if (reg.status !== "PENDING") {
      throw new Error("This registration has already been processed.");
    }

    // Check if user with this email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: reg.email } });
    if (existingUser) {
      throw new Error("A user with this email already exists.");
    }

    // Create User + Staff in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: reg.email,
          name: reg.name,
          hashedPassword: reg.hashedPassword,
          role,
          isActive: true,
        },
      });

      const newStaff = await tx.staff.create({
        data: {
          name: reg.name,
          email: reg.email,
          employeeCode: reg.employeeCode,
          designation: reg.designation,
          regionId: reg.regionId,
          reportingManagerId: reg.reportingManagerId,
          isActive: true,
        },
      });

      await tx.registrationRequest.update({
        where: { id: registrationId },
        data: {
          status: "APPROVED",
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });

      return { userId: newUser.id, staffId: newStaff.id };
    });

    await audit(user.id, "create", "User", result.userId, {
      email: reg.email,
      name: reg.name,
      role,
      fromRegistration: registrationId,
    });
    await audit(user.id, "create", "Staff", result.staffId, {
      name: reg.name,
      email: reg.email,
      fromRegistration: registrationId,
    });

    revalidatePath("/dashboard/settings");
    return result;
  }, mutationRoles);
}

// ─── Reject registration ─────────────────────────────────────────────

export async function rejectRegistration(
  registrationId: string,
  reason?: string
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    await checkRateLimit(user.id);

    const reg = await prisma.registrationRequest.findUnique({
      where: { id: registrationId },
    });

    if (!reg) {
      throw new Error("Registration request not found.");
    }
    if (reg.status !== "PENDING") {
      throw new Error("This registration has already been processed.");
    }

    await prisma.registrationRequest.update({
      where: { id: registrationId },
      data: {
        status: "REJECTED",
        reviewedById: user.id,
        reviewedAt: new Date(),
        rejectedReason: reason?.trim() || null,
      },
    });

    await audit(user.id, "update", "RegistrationRequest", registrationId, {
      action: "rejected",
      reason: reason?.trim() || null,
    });

    revalidatePath("/dashboard/settings");
    return { id: registrationId };
  }, mutationRoles);
}

// ─── Admin creates user directly ─────────────────────────────────────

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "MANAGER" | "STAFF" | "AUDITOR";
  employeeCode?: string;
  designation?: string;
  regionId?: string;
  reportingManagerId?: string;
}): Promise<ActionResult<{ userId: string; staffId: string }>> {
  return withAuth(async (user) => {
    await checkRateLimit(user.id);

    const email = input.email.toLowerCase().trim();
    const name = input.name.trim();

    if (!name || !email || !input.password) {
      throw new Error("Name, email, and password are required.");
    }
    if (input.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error("A user with this email already exists.");
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          name,
          hashedPassword,
          role: input.role,
          isActive: true,
        },
      });

      const newStaff = await tx.staff.create({
        data: {
          name,
          email,
          employeeCode: input.employeeCode?.trim() || null,
          designation: input.designation?.trim() || null,
          regionId: input.regionId || null,
          reportingManagerId: input.reportingManagerId || null,
          isActive: true,
        },
      });

      return { userId: newUser.id, staffId: newStaff.id };
    });

    await audit(user.id, "create", "User", result.userId, {
      email,
      name,
      role: input.role,
      directCreation: true,
    });
    await audit(user.id, "create", "Staff", result.staffId, {
      name,
      email,
      directCreation: true,
    });

    revalidatePath("/dashboard/settings");
    return result;
  }, mutationRoles);
}

// ─── Get regions + staff for registration form dropdowns ─────────────

export async function getRegionsForForm(): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    return prisma.region.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  });
}

export async function getStaffForForm(): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    return prisma.staff.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, designation: true },
    });
  });
}

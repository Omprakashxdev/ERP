"use server";

import { headers } from "next/headers";
import { requireAuth, requireRole, hasPermissionWithOverrides } from "@/lib/authz";
import { logAuditEvent } from "@/lib/audit";
import { rateLimitByIp } from "@/lib/rate-limit";
import { Role } from "@/types/auth";
import { ZodError } from "zod";

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role: Role;
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    const messages = error.issues.map((e) => {
      const field = e.path.length > 0 ? e.path.join(".") : "value";
      return `${field}: ${e.message}`;
    });
    return messages.join("; ");
  }
  
  // Handle Prisma Unique Constraint Violation
  if (typeof error === "object" && error !== null) {
    const anyErr = error as Record<string, any>;
    if (anyErr.code === "P2002") {
      const target = anyErr.meta?.target;
      if (Array.isArray(target)) {
        return `A record with this ${target.join(" and ")} already exists.`;
      } else if (typeof target === "string") {
        return `A record with this ${target} already exists.`;
      }
      return "A record with this information already exists.";
    }
  }

  if (error instanceof Error) return error.message;
  return "Action failed";
}

export async function withAuth<T>(
  action: (user: SessionUser) => Promise<T>,
  allowedRoles?: Role[]
): Promise<ActionResult<T>> {
  try {
    const user = allowedRoles
      ? await requireRole(allowedRoles)
      : await requireAuth();
    const data = await action(user);
    return { success: true, data };
  } catch (error) {
    const message = formatError(error);
    return { success: false, error: message };
  }
}

export async function withPermission<T>(
  resource: string,
  actionName: string,
  fn: (user: SessionUser) => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const user = await requireAuth();
    if (!(await hasPermissionWithOverrides(user.role, resource, actionName))) {
      return { success: false, error: "Forbidden" };
    }
    return { success: true, data: await fn(user) };
  } catch (error) {
    const message = formatError(error);
    return { success: false, error: message };
  }
}

export async function checkRateLimit(identifier: string) {
  const result = await rateLimitByIp(identifier);
  if (!result.success) {
    throw new Error("Rate limit exceeded. Please try again later.");
  }
}

export async function audit(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  metadata?: Record<string, unknown>
) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const userAgent = h.get("user-agent") ?? undefined;

  await logAuditEvent({
    userId,
    action,
    entity,
    entityId,
    metadata,
    ipAddress: ip,
    userAgent,
  });
}

export async function sanitizeForAudit(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return JSON.parse(
    JSON.stringify(input, (_key, value) => {
      if (value && typeof value === "object" && "toFixed" in value) {
        return value.toString();
      }
      return value;
    })
  );
}

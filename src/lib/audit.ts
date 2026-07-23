import { prisma } from "@/lib/prisma";

interface AuditOptions {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAuditEvent(options: AuditOptions) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: options.userId,
        action: options.action,
        entity: options.entity,
        entityId: options.entityId,
        metadata: (options.metadata ?? {}) as never,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      },
    });
  } catch {
    // Audit logging must never break the primary transaction.
  }
}

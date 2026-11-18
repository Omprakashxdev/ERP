"use server";

import { prisma } from "@/lib/prisma";
import { cuid } from "@/lib/schemas/shared";
import { withPermission, ActionResult } from "./wrapper";

const RESOURCE = "progressApp";

const photoSelect = {
  id: true,
  targetType: true,
  siteId: true,
  flatId: true,
  roomId: true,
  roomActivityId: true,
  mimeType: true,
  fileSize: true,
  caption: true,
  uploadedAt: true,
  originalFilename: true,
  uploadedBy: { select: { id: true, name: true, email: true } },
  roomActivity: {
    select: { activityNameSnapshot: true, status: true },
  },
  room: { select: { roomName: true } },
  flat: { select: { flatNumber: true } },
} as const;

type Scope =
  | { siteId: string }
  | { flatId: string }
  | { roomId: string };

/**
 * Read-only photo feed for the ERP galleries. Soft-deleted photos are
 * excluded from the gallery but preserved in storage and the table.
 */
export async function getProgressPhotos(
  scope: Scope
): Promise<ActionResult<unknown[]>> {
  return withPermission(RESOURCE, "read", async () => {
    let where;
    if ("siteId" in scope) {
      where = { siteId: cuid.parse(scope.siteId), deletedAt: null };
    } else if ("flatId" in scope) {
      where = { flatId: cuid.parse(scope.flatId), deletedAt: null };
    } else {
      where = { roomId: cuid.parse(scope.roomId), deletedAt: null };
    }
    return prisma.progressPhoto.findMany({
      where,
      select: photoSelect,
      orderBy: { uploadedAt: "desc" },
      take: 120,
    });
  });
}

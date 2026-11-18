import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ScopedRoom } from "@/lib/progress-rollup";

/**
 * Shared hierarchy-scope helpers for progress rollups — used by both the
 * ERP server actions and the mobile read APIs so both surfaces compute
 * identical, server-authoritative numbers.
 */

export const roomScopeSelect = {
  id: true,
  flatId: true,
  flat: {
    select: {
      floorId: true,
      floor: { select: { wingId: true, wing: { select: { siteId: true } } } },
    },
  },
  checklists: {
    where: { isActive: true },
    take: 1,
    select: {
      activities: {
        where: { isActive: true },
        select: { id: true, status: true },
      },
    },
  },
} as const;

export type Scope =
  | { siteId: string }
  | { wingId: string }
  | { floorId: string }
  | { flatId: string }
  | { roomId: string };

export function scopeWhere(scope: Scope): Prisma.ProgressRoomWhereInput {
  if ("roomId" in scope) return { id: scope.roomId };
  if ("flatId" in scope) return { flatId: scope.flatId };
  if ("floorId" in scope) return { flat: { floorId: scope.floorId } };
  if ("wingId" in scope) return { flat: { floor: { wingId: scope.wingId } } };
  return { flat: { floor: { wing: { siteId: scope.siteId } } } };
}

export async function roomsInScope(scope: Scope): Promise<ScopedRoom[]> {
  const rooms = await prisma.progressRoom.findMany({
    where: scopeWhere(scope),
    select: roomScopeSelect,
  });
  return rooms as unknown as ScopedRoom[];
}

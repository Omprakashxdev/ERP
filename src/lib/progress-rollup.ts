import { ProgressActivityStatus } from "@prisma/client";

/**
 * Progress rollup engine.
 *
 * A room is "configured" when it has an active checklist; its activities
 * are the snapshot rows under that checklist. Rollups aggregate RAW
 * completed/total activity counts — never averaged room percentages —
 * so a flat's progress is (all completed descendant activities) /
 * (all applicable descendant activities).
 *
 * Rooms without a checklist are excluded from the numeric denominator
 * but counted separately so a partially configured parent cannot look
 * fully complete without warning.
 */

export interface RollupActivity {
  status: string;
}

export interface ScopedRoom {
  id: string;
  flatId: string;
  flat: {
    floorId: string;
    floor: { wingId: string; wing: { siteId: string } };
  };
  /** Active checklists for the room (0 or 1). Empty = unconfigured. */
  checklists: { activities: RollupActivity[] }[];
}

export interface StatusCounts {
  notStarted: number;
  inProgress: number;
  onHold: number;
  completed: number;
}

export interface ProgressRollup {
  totalActivities: number;
  completedActivities: number;
  configuredRooms: number;
  unconfiguredRooms: number;
  /** null when nothing is configured — render "Progress not configured". */
  percent: number | null;
  /** Authoritative per-status breakdown — additive, safe for older clients. */
  statusCounts: StatusCounts;
}

export function rollupRooms(rooms: ScopedRoom[]): ProgressRollup {
  let totalActivities = 0;
  let completedActivities = 0;
  let configuredRooms = 0;
  let unconfiguredRooms = 0;
  const statusCounts: StatusCounts = {
    notStarted: 0,
    inProgress: 0,
    onHold: 0,
    completed: 0,
  };

  for (const room of rooms) {
    const checklist = room.checklists[0];
    if (!checklist || checklist.activities.length === 0) {
      unconfiguredRooms += 1;
      continue;
    }
    configuredRooms += 1;
    totalActivities += checklist.activities.length;
    for (const activity of checklist.activities) {
      switch (activity.status) {
        case ProgressActivityStatus.COMPLETED:
          completedActivities += 1;
          statusCounts.completed += 1;
          break;
        case ProgressActivityStatus.IN_PROGRESS:
          statusCounts.inProgress += 1;
          break;
        case ProgressActivityStatus.ON_HOLD:
          statusCounts.onHold += 1;
          break;
        default:
          statusCounts.notStarted += 1;
      }
    }
  }

  return {
    totalActivities,
    completedActivities,
    configuredRooms,
    unconfiguredRooms,
    percent:
      totalActivities === 0
        ? null
        : (completedActivities / totalActivities) * 100,
    statusCounts,
  };
}

/** Roll up per child key (e.g. each floor's progress within a wing). */
export function rollupByKey(
  rooms: ScopedRoom[],
  keyFor: (room: ScopedRoom) => string
): Map<string, ProgressRollup> {
  const groups = new Map<string, ScopedRoom[]>();
  for (const room of rooms) {
    const key = keyFor(room);
    const list = groups.get(key) ?? [];
    list.push(room);
    groups.set(key, list);
  }
  const out = new Map<string, ProgressRollup>();
  for (const [key, group] of groups) {
    out.set(key, rollupRooms(group));
  }
  return out;
}

import { describe, it, expect } from "vitest";
import { ProgressActivityStatus } from "@prisma/client";
import {
  rollupRooms,
  rollupByKey,
  ScopedRoom,
} from "@/lib/progress-rollup";

function room(
  id: string,
  statuses: string[] | null,
  flatId = "flat1",
  floorId = "floor1",
  wingId = "wing1",
  siteId = "site1"
): ScopedRoom {
  return {
    id,
    flatId,
    flat: {
      floorId,
      floor: { wingId, wing: { siteId } },
    },
    checklists:
      statuses === null ? [] : [{ activities: statuses.map((status) => ({ status })) }],
  };
}

const { NOT_STARTED, IN_PROGRESS, ON_HOLD, COMPLETED } =
  ProgressActivityStatus;

describe("progress rollup engine", () => {
  it("a configured room starts at 0%", () => {
    const r = rollupRooms([room("r1", [NOT_STARTED, NOT_STARTED])]);
    expect(r.percent).toBe(0);
    expect(r.completedActivities).toBe(0);
    expect(r.totalActivities).toBe(2);
  });

  it("4 of 10 completed yields 40%", () => {
    const statuses = [
      ...Array(4).fill(COMPLETED),
      ...Array(6).fill(NOT_STARTED),
    ];
    const r = rollupRooms([room("r1", statuses)]);
    expect(r.percent).toBeCloseTo(40);
  });

  it("IN_PROGRESS and ON_HOLD contribute zero completion", () => {
    const r = rollupRooms([
      room("r1", [IN_PROGRESS, ON_HOLD, COMPLETED, NOT_STARTED]),
    ]);
    expect(r.completedActivities).toBe(1);
    expect(r.percent).toBeCloseTo(25);
  });

  it("all completed yields 100%", () => {
    const r = rollupRooms([
      room("r1", [COMPLETED, COMPLETED, COMPLETED]),
    ]);
    expect(r.percent).toBe(100);
  });

  it("multi-room aggregation uses raw counts, not averaged percents", () => {
    // Room A 4/10 (40%), Room B 3/5 (60%) → 7/15 = 46.67%, NOT 50%
    const r = rollupRooms([
      room("a", [...Array(4).fill(COMPLETED), ...Array(6).fill(NOT_STARTED)]),
      room("b", [...Array(3).fill(COMPLETED), ...Array(2).fill(NOT_STARTED)]),
    ]);
    expect(r.totalActivities).toBe(15);
    expect(r.completedActivities).toBe(7);
    expect(r.percent).toBeCloseTo(46.67, 1);
  });

  it("unconfigured rooms are excluded but counted", () => {
    const r = rollupRooms([
      room("r1", [COMPLETED, NOT_STARTED]),
      room("r2", null), // no checklist
      room("r3", null),
    ]);
    expect(r.unconfiguredRooms).toBe(2);
    expect(r.configuredRooms).toBe(1);
    expect(r.totalActivities).toBe(2);
    expect(r.percent).toBeCloseTo(50);
  });

  it("no configured rooms → percent null (not fake 0%)", () => {
    const r = rollupRooms([room("r1", null), room("r2", null)]);
    expect(r.percent).toBeNull();
    expect(r.unconfiguredRooms).toBe(2);
  });

  it("room with a checklist but zero activities counts as unconfigured", () => {
    const r = rollupRooms([room("r1", [])]);
    expect(r.unconfiguredRooms).toBe(1);
    expect(r.percent).toBeNull();
  });

  it("rollupByKey aggregates per child", () => {
    const rooms = [
      room("r1", [COMPLETED, NOT_STARTED], "flatA"),
      room("r2", [COMPLETED, COMPLETED], "flatA"),
      room("r3", [COMPLETED], "flatB"),
    ];
    const map = rollupByKey(rooms, (r) => r.flatId);
    expect(map.get("flatA")!.totalActivities).toBe(4);
    expect(map.get("flatA")!.completedActivities).toBe(3);
    expect(map.get("flatB")!.percent).toBe(100);
  });
});

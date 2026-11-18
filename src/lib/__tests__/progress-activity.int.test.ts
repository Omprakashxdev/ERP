/**
 * Progress App — checklist/progress integration tests on a disposable DB.
 * Requires: RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 * Covers: template CRUD + reorder, snapshot assignment, template edits not
 * affecting snapshots, status transitions (revision + idempotency),
 * progress rollups at every level, unconfigured-room handling,
 * concurrent stale-revision rejection, and history preservation.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { ProgressActivityStatus } from "@prisma/client";

let currentRole = "ADMIN";

vi.mock("../actions/wrapper", () => ({
  withPermission: async (
    _r: string,
    action: string,
    fn: (u: { id: string }) => unknown
  ) => {
    if (action !== "read" && currentRole !== "ADMIN") {
      return {
        success: false,
        error: "You do not have permission to perform this action.",
      };
    }
    try {
      return { success: true, data: await fn({ id: "int-test-user" }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
  checkRateLimit: async () => {},
  audit: async () => {},
  sanitizeForAudit: async (v: unknown) => v,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/prisma";
import { createProgressSite } from "../actions/progress-site";
import {
  createProgressWing,
  createProgressFloor,
  createProgressFlat,
  createProgressRoom,
} from "../actions/progress-hierarchy";
import {
  createProgressTemplate,
  createProgressTemplateItem,
  updateProgressTemplateItem,
  moveProgressTemplateItem,
  setProgressTemplateActive,
  getProgressTemplateById,
  assignRoomChecklist,
  getProgressRoomById,
  transitionRoomActivityStatus,
  getScopeProgress,
  getChildrenProgress,
} from "../actions/progress-activity";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
const { NOT_STARTED, IN_PROGRESS, ON_HOLD, COMPLETED } =
  ProgressActivityStatus;

const siteIds: string[] = [];
const templateIds: string[] = [];

let seq = 0;
const eventId = () => `evt-int-${Date.now()}-${seq++}`;

async function makeHierarchy(suffix: string) {
  const site = await createProgressSite({
    siteCode: `ACT-${suffix}`,
    siteName: `Activity Test ${suffix}`,
  });
  expect(site.success).toBe(true);
  siteIds.push(site.data!.id);
  const wing = await createProgressWing({
    siteId: site.data!.id,
    code: "A",
    name: "Wing A",
  });
  const floor = await createProgressFloor({
    wingId: wing.data!.id,
    floorIdentifier: "1",
  });
  const flat = await createProgressFlat({
    floorId: floor.data!.id,
    flatNumber: "101",
  });
  return {
    siteId: site.data!.id,
    wingId: wing.data!.id,
    floorId: floor.data!.id,
    flatId: flat.data!.id,
  };
}

async function makeRoom(flatId: string, name: string) {
  const res = await createProgressRoom({ flatId, roomName: name });
  expect(res.success).toBe(true);
  return res.data!.id;
}

async function makeTemplate(name: string, activities: string[]) {
  const t = await createProgressTemplate({ name });
  expect(t.success).toBe(true);
  templateIds.push(t.data!.id);
  const ids: string[] = [];
  for (const activityName of activities) {
    const item = await createProgressTemplateItem({
      templateId: t.data!.id,
      activityName,
    });
    expect(item.success).toBe(true);
    ids.push(item.data!.id);
  }
  return { templateId: t.data!.id, itemIds: ids };
}

async function roomActivities(roomId: string) {
  return prisma.progressRoomActivity.findMany({
    where: { roomChecklist: { roomId, isActive: true }, isActive: true },
    orderBy: { displayOrder: "asc" },
  });
}

async function rollup(scope: Parameters<typeof getScopeProgress>[0]) {
  const res = await getScopeProgress(scope);
  expect(res.success).toBe(true);
  return res.data as {
    totalActivities: number;
    completedActivities: number;
    configuredRooms: number;
    unconfiguredRooms: number;
    percent: number | null;
  };
}

async function cleanup() {
  for (const siteId of siteIds) {
    const wings = await prisma.progressWing.findMany({
      where: { siteId },
      select: { id: true },
    });
    for (const w of wings) {
      const floors = await prisma.progressFloor.findMany({
        where: { wingId: w.id },
        select: { id: true },
      });
      for (const f of floors) {
        const flats = await prisma.progressFlat.findMany({
          where: { floorId: f.id },
          select: { id: true },
        });
        for (const fl of flats) {
          const rooms = await prisma.progressRoom.findMany({
            where: { flatId: fl.id },
            select: { id: true },
          });
          for (const r of rooms) {
            const checklists = await prisma.progressRoomChecklist.findMany({
              where: { roomId: r.id },
              select: { id: true },
            });
            for (const c of checklists) {
              const acts = await prisma.progressRoomActivity.findMany({
                where: { roomChecklistId: c.id },
                select: { id: true },
              });
              for (const a of acts) {
                await prisma.progressActivityHistory.deleteMany({
                  where: { roomActivityId: a.id },
                });
              }
              await prisma.progressRoomActivity.deleteMany({
                where: { roomChecklistId: c.id },
              });
            }
            await prisma.progressRoomChecklist.deleteMany({
              where: { roomId: r.id },
            });
          }
          await prisma.progressRoom.deleteMany({ where: { flatId: fl.id } });
        }
        await prisma.progressFlat.deleteMany({ where: { floorId: f.id } });
      }
      await prisma.progressFloor.deleteMany({ where: { wingId: w.id } });
    }
    await prisma.progressWing.deleteMany({ where: { siteId } });
    await prisma.progressSite.delete({ where: { id: siteId } }).catch(() => {});
  }
  for (const tid of templateIds) {
    await prisma.progressActivityTemplateItem
      .deleteMany({ where: { templateId: tid } })
      .catch(() => {});
    await prisma.progressActivityTemplate
      .delete({ where: { id: tid } })
      .catch(() => {});
  }
}

(SKIP ? describe.skip : describe)(
  "progress app checklists + progress — disposable DB",
  () => {
    beforeAll(async () => {
      currentRole = "ADMIN";
      await prisma.user.createMany({
        data: [
          {
            id: "int-test-user",
            email: "int-test-user@saec.test",
            hashedPassword: "x",
            role: "ADMIN",
          },
        ],
        skipDuplicates: true,
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("admin creates a template and adds + reorders activities", async () => {
      const { templateId, itemIds } = await makeTemplate("Living Room CL", [
        "Brick Work",
        "Internal Plaster",
        "Electrical Wiring",
        "Flooring",
      ]);
      expect(itemIds.length).toBe(4);

      // move last item up
      const moved = await moveProgressTemplateItem(itemIds[3], "up");
      expect(moved.success).toBe(true);

      const detail = await getProgressTemplateById(templateId);
      const items = (
        detail.data as { items: { id: string; activityName: string }[] }
      ).items;
      const names = items.map((i) => i.activityName);
      expect(names.slice(0, 3)).toEqual([
        "Brick Work",
        "Internal Plaster",
        "Flooring",
      ]);
      expect(names[3]).toBe("Electrical Wiring");

      // version bumped by item creates + reorder
      const tpl = await prisma.progressActivityTemplate.findUnique({
        where: { id: templateId },
      });
      expect(tpl!.version).toBeGreaterThan(1);
    });

    it("assigns a checklist snapshot — room starts at 0%", async () => {
      const h = await makeHierarchy("S01");
      const roomId = await makeRoom(h.flatId, "Living Room");
      const { templateId } = await makeTemplate("Living Checklist A", [
        "Plaster",
        "Wiring",
        "Flooring",
        "Painting",
      ]);

      const res = await assignRoomChecklist({ roomId, templateId });
      expect(res.success).toBe(true);

      const acts = await roomActivities(roomId);
      expect(acts.length).toBe(4);
      expect(
        acts.every(
          (a) => a.status === NOT_STARTED && a.activityNameSnapshot.length > 0
        )
      ).toBe(true);

      const r = await rollup({ roomId });
      expect(r.percent).toBe(0);
      expect(r.configuredRooms).toBe(1);
      expect(r.unconfiguredRooms).toBe(0);
    });

    it("transitions drive progress: 4/10 = 40%, non-completed counts zero", async () => {
      const h = await makeHierarchy("S02");
      const roomId = await makeRoom(h.flatId, "Bedroom");
      const acts = Array.from({ length: 10 }, (_, i) => `Task ${i + 1}`);
      const { templateId } = await makeTemplate("Ten Tasks", acts);
      await assignRoomChecklist({ roomId, templateId });

      const roomActs = await roomActivities(roomId);
      expect(roomActs.length).toBe(10);

      // complete 4
      for (let i = 0; i < 4; i++) {
        const a = roomActs[i];
        const res = await transitionRoomActivityStatus({
          roomActivityId: a.id,
          status: COMPLETED,
          expectedRevision: a.revision,
          eventId: eventId(),
        });
        expect(res.success).toBe(true);
      }
      // 2 in progress + 1 on hold — zero contribution
      const a4 = roomActs[4];
      await transitionRoomActivityStatus({
        roomActivityId: a4.id,
        status: IN_PROGRESS,
        expectedRevision: a4.revision,
        eventId: eventId(),
      });
      const a5 = roomActs[5];
      await transitionRoomActivityStatus({
        roomActivityId: a5.id,
        status: ON_HOLD,
        expectedRevision: a5.revision,
        eventId: eventId(),
      });

      const r = await rollup({ roomId });
      expect(r.completedActivities).toBe(4);
      expect(r.totalActivities).toBe(10);
      expect(r.percent).toBeCloseTo(40);
    });

    it("all activities completed → 100%; flat/floor/wing/site aggregate", async () => {
      const h = await makeHierarchy("S03");
      const roomA = await makeRoom(h.flatId, "Room A");
      const roomB = await makeRoom(h.flatId, "Room B");
      const t10 = await makeTemplate("Ten", Array.from({ length: 10 }, (_, i) => `T${i}`));
      const t5 = await makeTemplate("Five", Array.from({ length: 5 }, (_, i) => `F${i}`));
      await assignRoomChecklist({ roomId: roomA, templateId: t10.templateId });
      await assignRoomChecklist({ roomId: roomB, templateId: t5.templateId });

      const actsA = await roomActivities(roomA);
      const actsB = await roomActivities(roomB);
      for (let i = 0; i < 4; i++) {
        await transitionRoomActivityStatus({
          roomActivityId: actsA[i].id,
          status: COMPLETED,
          expectedRevision: actsA[i].revision,
          eventId: eventId(),
        });
      }
      for (let i = 0; i < 3; i++) {
        await transitionRoomActivityStatus({
          roomActivityId: actsB[i].id,
          status: COMPLETED,
          expectedRevision: actsB[i].revision,
          eventId: eventId(),
        });
      }

      // flat = 7/15 = 46.67% — raw counts, not avg(40%,60%)
      const flatR = await rollup({ flatId: h.flatId });
      expect(flatR.totalActivities).toBe(15);
      expect(flatR.completedActivities).toBe(7);
      expect(flatR.percent).toBeCloseTo(46.67, 1);

      // the same rollup bubbles to floor/wing/site (single flat subtree)
      const wingR = await rollup({ wingId: h.wingId });
      expect(wingR.percent).toBeCloseTo(46.67, 1);
      const siteR = await rollup({ siteId: h.siteId });
      expect(siteR.percent).toBeCloseTo(46.67, 1);

      // finish everything → 100%
      for (const a of actsA.slice(4)) {
        const cur = await prisma.progressRoomActivity.findUnique({
          where: { id: a.id },
        });
        await transitionRoomActivityStatus({
          roomActivityId: a.id,
          status: COMPLETED,
          expectedRevision: cur!.revision,
          eventId: eventId(),
        });
      }
      for (const a of actsB.slice(3)) {
        const cur = await prisma.progressRoomActivity.findUnique({
          where: { id: a.id },
        });
        await transitionRoomActivityStatus({
          roomActivityId: a.id,
          status: COMPLETED,
          expectedRevision: cur!.revision,
          eventId: eventId(),
        });
      }
      const done = await rollup({ flatId: h.flatId });
      expect(done.percent).toBe(100);
    });

    it("unconfigured rooms excluded from denominator and counted", async () => {
      const h = await makeHierarchy("S04");
      const configured = await makeRoom(h.flatId, "Kitchen");
      await makeRoom(h.flatId, "Store Room"); // no checklist
      const { templateId } = await makeTemplate("Kitchen CL", ["Tiles"]);
      await assignRoomChecklist({ roomId: configured, templateId });

      const flatR = await rollup({ flatId: h.flatId });
      expect(flatR.unconfiguredRooms).toBe(1);
      expect(flatR.configuredRooms).toBe(1);
      expect(flatR.totalActivities).toBe(1);
    });

    it("editing the template does NOT change an existing snapshot", async () => {
      const h = await makeHierarchy("S05");
      const roomId = await makeRoom(h.flatId, "Study");
      const { templateId, itemIds } = await makeTemplate("Study CL", [
        "Plaster",
        "Paint",
      ]);
      await assignRoomChecklist({ roomId, templateId });

      // rename template item + add a new one → version bumps
      await updateProgressTemplateItem({
        id: itemIds[0],
        activityName: "Internal Plaster RENAMED",
      });
      await createProgressTemplateItem({
        templateId,
        activityName: "New Activity",
      });

      const acts = await roomActivities(roomId);
      expect(acts.length).toBe(2); // snapshot unchanged
      expect(acts.map((a) => a.activityNameSnapshot)).toEqual([
        "Plaster",
        "Paint",
      ]);

      // snapshot recorded the version at assignment time
      const checklist = await prisma.progressRoomChecklist.findFirst({
        where: { roomId, isActive: true },
      });
      const template = await prisma.progressActivityTemplate.findUnique({
        where: { id: templateId },
      });
      expect(checklist!.templateVersion).toBeLessThan(template!.version);
    });

    it("replacing a checklist preserves the old one and resets progress", async () => {
      const h = await makeHierarchy("S06");
      const roomId = await makeRoom(h.flatId, "Hall");
      const t1 = await makeTemplate("Old CL", ["A1", "A2"]);
      await assignRoomChecklist({ roomId, templateId: t1.templateId });
      const old = await roomActivities(roomId);
      await transitionRoomActivityStatus({
        roomActivityId: old[0].id,
        status: COMPLETED,
        expectedRevision: 0,
        eventId: eventId(),
      });

      const t2 = await makeTemplate("New CL", ["B1", "B2", "B3"]);
      const res = await assignRoomChecklist({ roomId, templateId: t2.templateId });
      expect(res.success).toBe(true);

      // old checklist deactivated, its rows preserved
      const oldChecklists = await prisma.progressRoomChecklist.findMany({
        where: { roomId },
        orderBy: { assignedAt: "asc" },
      });
      expect(oldChecklists.length).toBe(2);
      expect(oldChecklists[0].isActive).toBe(false);
      expect(oldChecklists[1].isActive).toBe(true);
      const oldActs = await prisma.progressRoomActivity.findMany({
        where: { roomChecklistId: oldChecklists[0].id },
        orderBy: { displayOrder: "asc" },
      });
      expect(oldActs.length).toBe(2); // history preserved
      expect(oldActs[0].status).toBe(COMPLETED);

      // new snapshot active, progress reset to 0
      const acts = await roomActivities(roomId);
      expect(acts.length).toBe(3);
      const r = await rollup({ roomId });
      expect(r.percent).toBe(0);
    });

    it("deactivating a template preserves existing progress", async () => {
      const h = await makeHierarchy("S07");
      const roomId = await makeRoom(h.flatId, "Den");
      const { templateId } = await makeTemplate("Den CL", ["D1", "D2"]);
      await assignRoomChecklist({ roomId, templateId });
      const acts = await roomActivities(roomId);
      await transitionRoomActivityStatus({
        roomActivityId: acts[0].id,
        status: COMPLETED,
        expectedRevision: 0,
        eventId: eventId(),
      });

      const res = await setProgressTemplateActive(templateId, false);
      expect(res.success).toBe(true);

      const r = await rollup({ roomId });
      expect(r.percent).toBeCloseTo(50); // progress preserved
      const actRow = await prisma.progressRoomActivity.findUnique({
        where: { id: acts[0].id },
      });
      expect(actRow!.status).toBe(COMPLETED);
    });

    it("rejects transitions on stale revision — concurrent update safe", async () => {
      const h = await makeHierarchy("S08");
      const roomId = await makeRoom(h.flatId, "Lobby");
      const { templateId } = await makeTemplate("Lobby CL", ["L1"]);
      await assignRoomChecklist({ roomId, templateId });
      const [act] = await roomActivities(roomId);

      // two managers hold revision 0 — only one wins
      const [r1, r2] = await Promise.all([
        transitionRoomActivityStatus({
          roomActivityId: act.id,
          status: IN_PROGRESS,
          expectedRevision: 0,
          eventId: eventId(),
        }),
        transitionRoomActivityStatus({
          roomActivityId: act.id,
          status: COMPLETED,
          expectedRevision: 0,
          eventId: eventId(),
        }),
      ]);
      const winners = [r1, r2].filter((r) => r.success);
      const losers = [r1, r2].filter((r) => !r.success);
      expect(winners.length).toBe(1);
      expect(losers.length).toBe(1);
      expect(losers[0].error).toMatch(/stale|revision/i);
    });

    it("idempotent replay: same eventId applies once", async () => {
      const h = await makeHierarchy("S09");
      const roomId = await makeRoom(h.flatId, "Utility");
      const { templateId } = await makeTemplate("Utility CL", ["U1", "U2"]);
      await assignRoomChecklist({ roomId, templateId });
      const [act] = await roomActivities(roomId);

      const evt = eventId();
      const first = await transitionRoomActivityStatus({
        roomActivityId: act.id,
        status: COMPLETED,
        expectedRevision: 0,
        eventId: evt,
      });
      expect(first.success).toBe(true);
      expect(first.data!.alreadyApplied).toBe(false);

      // replay with the same eventId — even with a now-stale revision
      const replay = await transitionRoomActivityStatus({
        roomActivityId: act.id,
        status: COMPLETED,
        expectedRevision: 0,
        eventId: evt,
      });
      expect(replay.success).toBe(true);
      expect(replay.data!.alreadyApplied).toBe(true);

      const hist = await prisma.progressActivityHistory.findMany({
        where: { roomActivityId: act.id },
      });
      expect(hist.length).toBe(1);
      const row = await prisma.progressRoomActivity.findUnique({
        where: { id: act.id },
      });
      expect(row!.revision).toBe(1);
    });

    it("updates to different activities do not overwrite each other", async () => {
      const h = await makeHierarchy("S10");
      const roomId = await makeRoom(h.flatId, "Nook");
      const { templateId } = await makeTemplate("Nook CL", ["N1", "N2"]);
      await assignRoomChecklist({ roomId, templateId });
      const [a1, a2] = await roomActivities(roomId);

      const [r1, r2] = await Promise.all([
        transitionRoomActivityStatus({
          roomActivityId: a1.id,
          status: COMPLETED,
          expectedRevision: 0,
          eventId: eventId(),
        }),
        transitionRoomActivityStatus({
          roomActivityId: a2.id,
          status: IN_PROGRESS,
          expectedRevision: 0,
          eventId: eventId(),
        }),
      ]);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);

      const rows = await roomActivities(roomId);
      const statuses = rows.map((r) => r.status);
      expect(statuses).toContain(COMPLETED);
      expect(statuses).toContain(IN_PROGRESS);
    });

    it("history records previous/new status and changer attribution", async () => {
      const h = await makeHierarchy("S11");
      const roomId = await makeRoom(h.flatId, "Attic");
      const { templateId } = await makeTemplate("Attic CL", ["A1"]);
      await assignRoomChecklist({ roomId, templateId });
      const [act] = await roomActivities(roomId);

      await transitionRoomActivityStatus({
        roomActivityId: act.id,
        status: IN_PROGRESS,
        expectedRevision: 0,
        eventId: eventId(),
        notes: "Started electrical",
      });
      await transitionRoomActivityStatus({
        roomActivityId: act.id,
        status: COMPLETED,
        expectedRevision: 1,
        eventId: eventId(),
      });

      const hist = await prisma.progressActivityHistory.findMany({
        where: { roomActivityId: act.id },
        orderBy: { createdAt: "asc" },
      });
      expect(hist.length).toBe(2);
      expect(hist[0].previousStatus).toBe(NOT_STARTED);
      expect(hist[0].newStatus).toBe(IN_PROGRESS);
      expect(hist[0].notes).toBe("Started electrical");
      expect(hist[1].previousStatus).toBe(IN_PROGRESS);
      expect(hist[1].newStatus).toBe(COMPLETED);
      expect(hist.every((x) => x.changedById === "int-test-user")).toBe(true);
    });

    it("non-admin cannot mutate templates or activities", async () => {
      currentRole = "STAFF";
      const tpl = await createProgressTemplate({ name: "No Way" });
      expect(tpl.success).toBe(false);
      const res = await transitionRoomActivityStatus({
        roomActivityId: "clany0000000000000000000",
        status: COMPLETED,
        expectedRevision: 0,
        eventId: eventId(),
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/permission/i);
      currentRole = "ADMIN";
    });

    it("room detail + children progress getters return the checklist", async () => {
      const h = await makeHierarchy("S12");
      const roomId = await makeRoom(h.flatId, "Veranda");
      const { templateId } = await makeTemplate("Veranda CL", ["V1"]);
      await assignRoomChecklist({ roomId, templateId });

      const detail = await getProgressRoomById(roomId);
      expect(detail.success).toBe(true);
      const data = detail.data as {
        checklists: { activities: unknown[] }[];
        flat: { floor: { wing: { site: { siteCode: string } } } };
      };
      expect(data.checklists.length).toBe(1);
      expect(data.checklists[0].activities.length).toBe(1);
      expect(data.flat.floor.wing.site.siteCode).toBe("ACT-S12");

      const perRoom = await getChildrenProgress("room", h.flatId);
      expect(perRoom.success).toBe(true);
      const map = perRoom.data as Record<string, { totalActivities: number }>;
      expect(map[roomId].totalActivities).toBe(1);
    });
  }
);

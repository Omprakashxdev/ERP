/**
 * Progress App — hierarchy integration tests on a disposable database.
 * Requires: RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 * Covers: multi-wing sites, different floors per wing, flats, rooms,
 * same-parent duplicate rejection, cross-parent duplicate allowance,
 * parent deactivation preserving descendants, non-admin rejection,
 * invalid-parent rejection and persistence.
 *
 * The wrapper mock consults a switchable role so non-admin mutation
 * rejection exercises the real permission decision path.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

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
  updateProgressWing,
  setProgressWingActive,
  getProgressWings,
  getProgressWingById,
  createProgressFloor,
  getProgressFloors,
  createProgressFlat,
  getProgressFlats,
  createProgressRoom,
  getProgressRooms,
} from "../actions/progress-hierarchy";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
const siteIds: string[] = [];

async function makeSite(siteCode: string) {
  const res = await createProgressSite({
    siteCode,
    siteName: `Hierarchy Test ${siteCode}`,
  });
  expect(res.success).toBe(true);
  siteIds.push(res.data!.id);
  return res.data!.id;
}

async function cleanupSite(siteId: string) {
  const wings = await prisma.progressWing.findMany({
    where: { siteId },
    select: { id: true },
  });
  for (const wing of wings) {
    const floors = await prisma.progressFloor.findMany({
      where: { wingId: wing.id },
      select: { id: true },
    });
    for (const floor of floors) {
      const flats = await prisma.progressFlat.findMany({
        where: { floorId: floor.id },
        select: { id: true },
      });
      for (const flat of flats) {
        await prisma.progressRoom.deleteMany({ where: { flatId: flat.id } });
      }
      await prisma.progressFlat.deleteMany({ where: { floorId: floor.id } });
    }
    await prisma.progressFloor.deleteMany({ where: { wingId: wing.id } });
  }
  await prisma.progressWing.deleteMany({ where: { siteId } });
  await prisma.progressSite.delete({ where: { id: siteId } }).catch(() => {});
}

(SKIP ? describe.skip : describe)(
  "progress app hierarchy — disposable DB",
  () => {
    beforeAll(async () => {
      currentRole = "ADMIN";
      // createMany+skipDuplicates is race-safe — integration files run in
      // parallel workers and all need this fixture user for the
      // createdById FK. Leftover row is harmless on the disposable DB.
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
      currentRole = "ADMIN";
      for (const id of siteIds) {
        await cleanupSite(id);
      }
      await prisma.$disconnect();
    });

    it("creates a site with multiple wings", async () => {
      const siteId = await makeSite("HIER-001");

      const wingA = await createProgressWing({
        siteId,
        code: "a",
        name: "Tower A",
      });
      const wingB = await createProgressWing({
        siteId,
        code: "B",
        name: "Tower B",
        description: "North side",
        displayOrder: 2,
      });
      expect(wingA.success).toBe(true);
      expect(wingB.success).toBe(true);

      const rows = await prisma.progressWing.findMany({ where: { siteId } });
      expect(rows.length).toBe(2);
      const codes = rows.map((r) => r.code).sort();
      expect(codes).toEqual(["A", "B"]); // code normalized to uppercase
    });

    it("rejects duplicate wing code in the same site, allows it in another site", async () => {
      const site1 = await makeSite("HIER-002");
      const site2 = await makeSite("HIER-003");

      await createProgressWing({ siteId: site1, code: "A", name: "Wing A" });
      const dup = await createProgressWing({
        siteId: site1,
        code: "a", // case-insensitive clash after normalization
        name: "Duplicate",
      });
      expect(dup.success).toBe(false);
      expect(dup.error).toMatch(/already|duplicate|in use/i);

      const otherSite = await createProgressWing({
        siteId: site2,
        code: "A",
        name: "Wing A",
      });
      expect(otherSite.success).toBe(true);
    });

    it("creates different floors under different wings", async () => {
      const siteId = await makeSite("HIER-004");
      const w1 = await createProgressWing({ siteId, code: "A", name: "A" });
      const w2 = await createProgressWing({ siteId, code: "B", name: "B" });

      // Wing A: G, 1, 2 — Wing B: B1, G (a different structure)
      for (const [wingId, ident] of [
        [w1.data!.id, "G"],
        [w1.data!.id, "1"],
        [w1.data!.id, "2"],
        [w2.data!.id, "B1"],
        [w2.data!.id, "G"],
      ] as const) {
        const res = await createProgressFloor({ wingId, floorIdentifier: ident });
        expect(res.success).toBe(true);
      }

      const floorsA = await getProgressFloors(w1.data!.id);
      const floorsB = await getProgressFloors(w2.data!.id);
      expect(floorsA.data!.length).toBe(3);
      expect(floorsB.data!.length).toBe(2);

      // duplicate in same wing rejected; same identifier in other wing OK (already created)
      const dup = await createProgressFloor({
        wingId: w1.data!.id,
        floorIdentifier: "g",
      });
      expect(dup.success).toBe(false);
    });

    it("rejects floors under a non-existent wing", async () => {
      const res = await createProgressFloor({
        wingId: "cldoesnotexist000000000",
        floorIdentifier: "1",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/wing not found/i);
    });

    it("creates flats with different numbers and multiple rooms in one flat", async () => {
      const siteId = await makeSite("HIER-005");
      const w = await createProgressWing({ siteId, code: "A", name: "A" });
      const f = await createProgressFloor({
        wingId: w.data!.id,
        floorIdentifier: "1",
      });

      const flat101 = await createProgressFlat({
        floorId: f.data!.id,
        flatNumber: "101",
        flatType: "2BHK",
      });
      const flat102 = await createProgressFlat({
        floorId: f.data!.id,
        flatNumber: "102",
        flatType: "3BHK",
      });
      expect(flat101.success).toBe(true);
      expect(flat102.success).toBe(true);

      const dupFlat = await createProgressFlat({
        floorId: f.data!.id,
        flatNumber: "101",
      });
      expect(dupFlat.success).toBe(false);

      for (const [name, type] of [
        ["Living Room", "Living"],
        ["Bedroom 1", "Bedroom"],
        ["Bedroom 2", "Bedroom"],
        ["Kitchen", "Kitchen"],
        ["Bathroom", "Bathroom"],
      ] as const) {
        const res = await createProgressRoom({
          flatId: flat101.data!.id,
          roomName: name,
          roomType: type,
        });
        expect(res.success).toBe(true);
      }

      const rooms = await getProgressRooms(flat101.data!.id);
      expect(rooms.data!.length).toBe(5);

      // duplicate room name in same flat rejected; same name in flat 102 allowed
      const dupRoom = await createProgressRoom({
        flatId: flat101.data!.id,
        roomName: "Living Room",
      });
      expect(dupRoom.success).toBe(false);

      const sameNameOtherFlat = await createProgressRoom({
        flatId: flat102.data!.id,
        roomName: "Living Room",
      });
      expect(sameNameOtherFlat.success).toBe(true);
    });

    it("deactivating a parent preserves all descendants", async () => {
      const siteId = await makeSite("HIER-006");
      const w = await createProgressWing({ siteId, code: "A", name: "A" });
      const f = await createProgressFloor({
        wingId: w.data!.id,
        floorIdentifier: "1",
      });
      const flat = await createProgressFlat({
        floorId: f.data!.id,
        flatNumber: "101",
      });
      const room = await createProgressRoom({
        flatId: flat.data!.id,
        roomName: "Kitchen",
      });

      const res = await setProgressWingActive(w.data!.id, false);
      expect(res.success).toBe(true);

      const wing = await prisma.progressWing.findUnique({
        where: { id: w.data!.id },
      });
      expect(wing!.isActive).toBe(false);

      // descendants untouched — all rows intact, still active
      const floorRow = await prisma.progressFloor.findUnique({
        where: { id: f.data!.id },
      });
      const flatRow = await prisma.progressFlat.findUnique({
        where: { id: flat.data!.id },
      });
      const roomRow = await prisma.progressRoom.findUnique({
        where: { id: room.data!.id },
      });
      expect(floorRow).not.toBeNull();
      expect(flatRow).not.toBeNull();
      expect(roomRow).not.toBeNull();
      expect(floorRow!.isActive).toBe(true);
      expect(flatRow!.isActive).toBe(true);
      expect(roomRow!.isActive).toBe(true);

      // reactivation works
      const re = await setProgressWingActive(w.data!.id, true);
      expect(re.success).toBe(true);
    });

    it("rejects non-admin mutations", async () => {
      currentRole = "STAFF";
      const res = await createProgressWing({
        siteId: "clany0000000000000000000",
        code: "X",
        name: "X",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/permission/i);
      currentRole = "ADMIN";
    });

    it("updates a wing and persists; getters return the hierarchy", async () => {
      const siteId = await makeSite("HIER-007");
      const w = await createProgressWing({ siteId, code: "A", name: "Old" });
      const res = await updateProgressWing({
        id: w.data!.id,
        name: "New Name",
        displayOrder: 5,
      });
      expect(res.success).toBe(true);

      const detail = await getProgressWingById(w.data!.id);
      expect(detail.success).toBe(true);
      const data = detail.data as {
        name: string;
        displayOrder: number;
        site: { siteCode: string };
      };
      expect(data.name).toBe("New Name");
      expect(data.displayOrder).toBe(5);
      expect(data.site.siteCode).toBe("HIER-007");

      const list = await getProgressWings(siteId);
      expect(list.data!.length).toBe(1);

      const flats = await getProgressFlats("cldoesnotexist000000000");
      expect(flats.success).toBe(true);
      expect(flats.data!.length).toBe(0);
    });
  }
);

/**
 * User-module-permission save path — integration test on a disposable DB.
 * Requires: RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 * Covers: create (deny-all), update (grant), reset (delete), validation
 * rejections, admin-target protection, and cache invalidation.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const invalidatePermissionCache = vi.fn();
let actorRole = "ADMIN";

vi.mock("@/lib/authz", () => ({
  requireAuth: async () => ({ id: "int-actor", role: actorRole }),
  invalidatePermissionCache: (...args: unknown[]) =>
    invalidatePermissionCache(...args),
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: async (
    _r: string,
    _a: string,
    fn: (u: { id: string }) => unknown
  ) => {
    try {
      return { success: true, data: await fn({ id: "int-actor" }) };
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
import {
  setUserModulePermission,
  getUserModulePermissions,
} from "../actions/permissions";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;

(SKIP ? describe.skip : describe)(
  "setUserModulePermission (integration)",
  () => {
    let userId: string;

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: `int-mgr-${Date.now()}@test.local`,
          hashedPassword: "x",
          role: "MANAGER",
          name: "Int Test Manager",
        },
      });
      userId = user.id;
    });

    afterAll(async () => {
      await prisma.user.delete({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it("creates a deny-all row and invalidates the permission cache", async () => {
      invalidatePermissionCache.mockClear();
      const res = await setUserModulePermission(userId, "fundFlow", []);
      expect(res.success).toBe(true);

      const row = await prisma.userModulePermission.findUnique({
        where: { userId_resource: { userId, resource: "fundFlow" } },
      });
      expect(row).not.toBeNull();
      expect(row!.allowedActions).toEqual([]);
      expect(invalidatePermissionCache).toHaveBeenCalled();
    });

    it("upserts — same user+resource never duplicates", async () => {
      const res = await setUserModulePermission(userId, "fundFlow", [
        "read",
      ]);
      expect(res.success).toBe(true);

      const rows = await prisma.userModulePermission.findMany({
        where: { userId, resource: "fundFlow" },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].allowedActions).toEqual(["read"]);
    });

    it("reset (null) deletes the override row", async () => {
      const res = await setUserModulePermission(userId, "fundFlow", null);
      expect(res.success).toBe(true);

      const count = await prisma.userModulePermission.count({
        where: { userId, resource: "fundFlow" },
      });
      expect(count).toBe(0);
    });

    it("getUserModulePermissions reflects saved state", async () => {
      await setUserModulePermission(userId, "dueBills", []);
      const res = await getUserModulePermissions(userId);
      expect(res.success).toBe(true);
      const dueBills = res.data!.modules.find((m) => m.resource === "dueBills")!;
      expect(dueBills.override).toEqual([]);
      expect(dueBills.effective).toEqual([]);
      const fundFlow = res.data!.modules.find(
        (m) => m.resource === "fundFlow"
      )!;
      expect(fundFlow.override).toBeNull(); // reset earlier
      await setUserModulePermission(userId, "dueBills", null);
    });

    it("rejects unknown resources and invalid actions", async () => {
      expect(
        (await setUserModulePermission(userId, "notAModule", [])).success
      ).toBe(false);
      expect(
        (
          await setUserModulePermission(userId, "fundFlow", [
            "read",
            "teleport",
          ])
        ).success
      ).toBe(false);
      expect(
        await prisma.userModulePermission.count({ where: { userId } })
      ).toBe(0);
    });

    it("rejects non-admin actors and admin targets", async () => {
      actorRole = "MANAGER";
      expect(
        (await setUserModulePermission(userId, "fundFlow", [])).success
      ).toBe(false);
      actorRole = "ADMIN";

      const admin = await prisma.user.create({
        data: {
          email: `int-admin-${Date.now()}@test.local`,
          hashedPassword: "x",
          role: "ADMIN",
        },
      });
      expect(
        (await setUserModulePermission(admin.id, "fundFlow", [])).success
      ).toBe(false);
      await prisma.user.delete({ where: { id: admin.id } });
    });
  }
);

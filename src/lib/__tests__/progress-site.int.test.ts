/**
 * Progress App — Site Master integration tests on a disposable database.
 * Requires: RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 * Covers: create, unique site-code rejection, persistence, update,
 * search/status filters, archive (soft-delete keeps the row), and
 * default list excluding archived sites.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../actions/wrapper", () => ({
  withPermission: async (
    _r: string,
    _a: string,
    fn: (u: { id: string }) => unknown
  ) => {
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
import {
  createProgressSite,
  updateProgressSite,
  setProgressSiteStatus,
  getProgressSites,
  getProgressSiteById,
} from "../actions/progress-site";
import { ProgressSiteStatus } from "@prisma/client";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
const siteIds: string[] = [];

function base(extra: object = {}) {
  return {
    siteCode: "INT-TEST-001",
    siteName: "Integration Test Site",
    city: "Ahmedabad",
    state: "Gujarat",
    ...extra,
  };
}

async function createSite(extra: object = {}) {
  const res = await createProgressSite(base(extra));
  if (res.success && res.data) siteIds.push(res.data.id);
  return res;
}

(SKIP ? describe.skip : describe)(
  "progress app site master — disposable DB",
  () => {
    beforeAll(async () => {
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
      for (const id of siteIds) {
        await prisma.progressSite
          .delete({ where: { id } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    });

    it("creates a site and persists it", async () => {
      const res = await createSite();
      expect(res.success).toBe(true);

      const row = await prisma.progressSite.findUnique({
        where: { id: res.data!.id },
      });
      expect(row).not.toBeNull();
      expect(row!.siteCode).toBe("INT-TEST-001");
      expect(row!.siteName).toBe("Integration Test Site");
      expect(row!.status).toBe(ProgressSiteStatus.PLANNED);
      expect(row!.createdById).toBeTruthy();
    });

    it("rejects duplicate site codes with a friendly error", async () => {
      const dup = await createSite({ siteCode: "INT-TEST-001" });
      expect(dup.success).toBe(false);
      expect(dup.error).toMatch(/already in use/i);
    });

    it("rejects invalid input through zod", async () => {
      const bad = await createSite({ siteCode: "bad code!!" });
      expect(bad.success).toBe(false);
    });

    it("updates site details", async () => {
      const created = await createSite({ siteCode: "INT-TEST-002" });
      expect(created.success).toBe(true);

      const res = await updateProgressSite({
        id: created.data!.id,
        siteName: "Renamed Site",
        status: ProgressSiteStatus.ACTIVE,
        city: "Surat",
      });
      expect(res.success).toBe(true);

      const row = await prisma.progressSite.findUnique({
        where: { id: created.data!.id },
      });
      expect(row!.siteName).toBe("Renamed Site");
      expect(row!.status).toBe(ProgressSiteStatus.ACTIVE);
      expect(row!.city).toBe("Surat");
      // immutable identifier preserved
      expect(row!.siteCode).toBe("INT-TEST-002");
    });

    it("searches by site name or code", async () => {
      await createSite({
        siteCode: "INT-TEST-003",
        siteName: "Unique Searchable Name",
      });

      const byName = await getProgressSites({ search: "Searchable" }, 1, 25);
      expect(byName.success).toBe(true);
      expect(byName.data!.rows.length).toBeGreaterThanOrEqual(1);

      const byCode = await getProgressSites({ search: "int-test-003" }, 1, 25);
      expect(byCode.success).toBe(true);
      expect(byCode.data!.rows.length).toBeGreaterThanOrEqual(1);

      const none = await getProgressSites(
        { search: "zzz-no-match-zzz" },
        1,
        25
      );
      expect(none.success).toBe(true);
      expect(none.data!.rows.length).toBe(0);
    });

    it("filters by status", async () => {
      const created = await createSite({ siteCode: "INT-TEST-004" });
      await setProgressSiteStatus(
        created.data!.id,
        ProgressSiteStatus.ON_HOLD
      );

      const held = await getProgressSites(
        { status: ProgressSiteStatus.ON_HOLD },
        1,
        25
      );
      expect(held.success).toBe(true);
      const ids = (held.data!.rows as { id: string }[]).map((r) => r.id);
      expect(ids).toContain(created.data!.id);
    });

    it("archives a site — row kept in DB, hidden from default list", async () => {
      const created = await createSite({ siteCode: "INT-TEST-005" });
      const res = await setProgressSiteStatus(
        created.data!.id,
        ProgressSiteStatus.ARCHIVED
      );
      expect(res.success).toBe(true);

      const row = await prisma.progressSite.findUnique({
        where: { id: created.data!.id },
      });
      expect(row).not.toBeNull();
      expect(row!.status).toBe(ProgressSiteStatus.ARCHIVED);

      const defaultList = await getProgressSites({}, 1, 25);
      const defaultIds = (defaultList.data!.rows as { id: string }[]).map(
        (r) => r.id
      );
      expect(defaultIds).not.toContain(created.data!.id);

      const archivedList = await getProgressSites(
        { status: ProgressSiteStatus.ARCHIVED },
        1,
        25
      );
      const archivedIds = (
        archivedList.data!.rows as { id: string }[]
      ).map((r) => r.id);
      expect(archivedIds).toContain(created.data!.id);
    });

    it("getProgressSiteById returns the site", async () => {
      const created = await createSite({ siteCode: "INT-TEST-006" });
      const res = await getProgressSiteById(created.data!.id);
      expect(res.success).toBe(true);
      expect((res.data as { siteCode: string }).siteCode).toBe(
        "INT-TEST-006"
      );
    });
  }
);

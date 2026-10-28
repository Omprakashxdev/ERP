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
  uploadSiteCover,
  removeSiteCover,
  getSiteSetupCounts,
} from "../actions/progress-site";
import {
  pathForStorageKey,
  readPhotoFile,
  deletePhotoFile,
  MAX_COVER_BYTES,
} from "../progress-photos";
import { ProgressSiteStatus } from "@prisma/client";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
const siteIds: string[] = [];

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from([0x00, 0x10]),
  Buffer.from("JFIF\0", "ascii"),
  Buffer.alloc(11, 0),
  Buffer.from([0xff, 0xd9]),
]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.from("VP8 ", "ascii"),
  Buffer.from([0x0e, 0x00, 0x00, 0x00]),
  Buffer.alloc(14, 0),
]);
const SVG_BYTES = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);

function coverForm(bytes: Buffer, filename = "cover.png") {
  const fd = new FormData();
  fd.append(
    "file",
    new File([new Uint8Array(bytes)], filename, { type: "image/png" })
  );
  return fd;
}

async function storedCoverBytes(siteId: string) {
  const site = await prisma.progressSite.findUniqueOrThrow({
    where: { id: siteId },
    select: { coverImagePath: true },
  });
  if (!site.coverImagePath) return null;
  return {
    key: site.coverImagePath,
    abs: await pathForStorageKey(site.coverImagePath),
    bytes: await readPhotoFile(site.coverImagePath),
  };
}

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
        const site = await prisma.progressSite
          .findUnique({ where: { id }, select: { coverImagePath: true } })
          .catch(() => null);
        if (site?.coverImagePath) {
          await deletePhotoFile(site.coverImagePath).catch(() => {});
        }
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

    /* ─── Site cover image ─── */

    it("accepts PNG, JPEG and WebP covers and persists them on disk", async () => {
      for (const [bytes, ext] of [
        [PNG_1PX, ".png"],
        [JPEG_BYTES, ".jpg"],
        [WEBP_BYTES, ".webp"],
      ] as const) {
        const site = await createSite({
          siteCode: `INT-COVER-${ext.slice(1).toUpperCase()}`,
        });
        const res = await uploadSiteCover(
          site.data!.id,
          coverForm(bytes, `cover${ext}`)
        );
        expect(res.success).toBe(true);

        const stored = await storedCoverBytes(site.data!.id);
        expect(stored).not.toBeNull();
        expect(stored!.key).toMatch(new RegExp(`\\${ext}$`));
        // File physically exists inside the persistent photo root —
        // never under public/ or the standalone build output.
        expect(stored!.abs).toBeTruthy();
        expect(stored!.bytes).not.toBeNull();
        expect(stored!.abs!).not.toMatch(/public[\\/]/);
        expect(stored!.abs!).not.toMatch(/\.next[\\/]/);
      }
    });

    it("rejects covers over the 5 MB cap", async () => {
      const site = await createSite({ siteCode: "INT-COVER-BIG" });
      const big = Buffer.concat([
        PNG_1PX,
        Buffer.alloc(MAX_COVER_BYTES + 1 - PNG_1PX.length, 0),
      ]);
      const res = await uploadSiteCover(
        site.data!.id,
        coverForm(big, "big.png")
      );
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/5 ?MB/i);
      expect(await storedCoverBytes(site.data!.id)).toBeNull();
    });

    it("rejects non-image bytes even with an image filename", async () => {
      const site = await createSite({ siteCode: "INT-COVER-SVG" });
      const res = await uploadSiteCover(
        site.data!.id,
        coverForm(SVG_BYTES, "cover.png")
      );
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/JPEG, PNG or WebP/i);
      expect(await storedCoverBytes(site.data!.id)).toBeNull();
    });

    it("replaces a cover — new key stored, old file deleted", async () => {
      const site = await createSite({ siteCode: "INT-COVER-REPL" });
      await uploadSiteCover(site.data!.id, coverForm(PNG_1PX));
      const first = await storedCoverBytes(site.data!.id);
      expect(first).not.toBeNull();

      const res = await uploadSiteCover(
        site.data!.id,
        coverForm(JPEG_BYTES, "new.jpg")
      );
      expect(res.success).toBe(true);
      const second = await storedCoverBytes(site.data!.id);
      expect(second!.key).not.toBe(first!.key);
      expect(second!.key).toMatch(/\.jpg$/);
      // old file removed from persistent storage
      expect(await pathForStorageKey(first!.key)).toBeNull();
      expect(await readPhotoFile(first!.key)).toBeNull();
    });

    it("removes a cover — key cleared, file deleted", async () => {
      const site = await createSite({ siteCode: "INT-COVER-RM" });
      await uploadSiteCover(site.data!.id, coverForm(PNG_1PX));
      const before = await storedCoverBytes(site.data!.id);
      expect(before).not.toBeNull();

      const res = await removeSiteCover(site.data!.id);
      expect(res.success).toBe(true);
      expect(await storedCoverBytes(site.data!.id)).toBeNull();
      expect(await pathForStorageKey(before!.key)).toBeNull();
    });

    it("rejects cover upload for a missing site", async () => {
      const res = await uploadSiteCover(
        "c000000000000000000000000",
        coverForm(PNG_1PX)
      );
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });

    /* ─── Site setup counts (guided setup card) ─── */

    it("getSiteSetupCounts returns zeroed counts for a new site", async () => {
      const site = await createSite({ siteCode: "INT-SETUP-001" });
      const res = await getSiteSetupCounts(site.data!.id);
      expect(res.success).toBe(true);
      expect(res.data).toMatchObject({
        wings: 0,
        floors: 0,
        flats: 0,
        rooms: 0,
        checklists: 0,
        assignments: 0,
        firstWingId: null,
        firstFloorId: null,
        firstFlatId: null,
        firstRoomId: null,
      });
    });
  }
);

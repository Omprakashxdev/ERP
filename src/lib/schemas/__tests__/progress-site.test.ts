import { describe, it, expect } from "vitest";
import { ProgressSiteStatus } from "@prisma/client";
import {
  progressSiteCreateSchema,
  progressSiteUpdateSchema,
  progressSiteFilterSchema,
} from "@/lib/schemas/progress-site";

const validId = "clxxxxxxxxxxxxxxxxxxxxxxxxx";

describe("Progress App — site schema", () => {
  it("accepts a valid create payload and uppercases the site code", () => {
    const result = progressSiteCreateSchema.safeParse({
      siteCode: " saec-001 ",
      siteName: "Shivalik Residency",
      city: "Ahmedabad",
      state: "Gujarat",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.siteCode).toBe("SAEC-001");
      expect(result.data.status).toBe(ProgressSiteStatus.PLANNED);
    }
  });

  it("rejects an empty site code", () => {
    const result = progressSiteCreateSchema.safeParse({
      siteCode: "",
      siteName: "Site",
    });
    expect(result.success).toBe(false);
  });

  it("rejects site codes with invalid characters", () => {
    for (const code of ["SITE 01", "SITE@1", "_BAD", "-BAD", "A"]) {
      const result = progressSiteCreateSchema.safeParse({
        siteCode: code,
        siteName: "Site",
      });
      expect(result.success).toBe(false);
    }
  });

  it("accepts hyphens and underscores in site codes", () => {
    for (const code of ["SAEC-001", "SAEC_002", "SAEC-01_A"]) {
      const result = progressSiteCreateSchema.safeParse({
        siteCode: code,
        siteName: "Site",
      });
      expect(result.success).toBe(true);
    }
  });

  it("coerces numeric-string coordinates and nulls empties", () => {
    const result = progressSiteCreateSchema.safeParse({
      siteCode: "SAEC-003",
      siteName: "Site",
      latitude: "23.0225",
      longitude: "72.5714",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latitude).toBeCloseTo(23.0225);
      expect(result.data.longitude).toBeCloseTo(72.5714);
    }

    const empty = progressSiteCreateSchema.safeParse({
      siteCode: "SAEC-004",
      siteName: "Site",
      latitude: "",
      longitude: "",
    });
    expect(empty.success).toBe(true);
    if (empty.success) {
      expect(empty.data.latitude).toBeNull();
      expect(empty.data.longitude).toBeNull();
    }
  });

  it("rejects out-of-range coordinates", () => {
    const bad = progressSiteCreateSchema.safeParse({
      siteCode: "SAEC-005",
      siteName: "Site",
      latitude: 95,
    });
    expect(bad.success).toBe(false);

    const badLng = progressSiteCreateSchema.safeParse({
      siteCode: "SAEC-005",
      siteName: "Site",
      longitude: -200,
    });
    expect(badLng.success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    const result = progressSiteCreateSchema.safeParse({
      siteCode: "SAEC-006",
      siteName: "Site",
      status: "BOGUS",
    });
    expect(result.success).toBe(false);
  });

  it("update schema strips siteCode (immutable identifier)", () => {
    const result = progressSiteUpdateSchema.safeParse({
      id: validId,
      siteCode: "CHANGED-01",
      siteName: "Renamed Site",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.siteName).toBe("Renamed Site");
      expect("siteCode" in result.data).toBe(false);
    }
  });

  it("update schema requires id", () => {
    const result = progressSiteUpdateSchema.safeParse({
      siteName: "No id",
    });
    expect(result.success).toBe(false);
  });

  it("filter schema accepts search + status", () => {
    const result = progressSiteFilterSchema.safeParse({
      search: "residency",
      status: ProgressSiteStatus.ACTIVE,
    });
    expect(result.success).toBe(true);
  });
});

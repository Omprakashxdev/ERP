import { describe, it, expect } from "vitest";
import { tadaClaimCreateSchema } from "@/lib/schemas/tada-bills";

const validBase = {
  staffId: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
  tourPurpose: "Site visit",
  fromDate: "2025-01-01",
  toDate: "2025-01-05",
  location: "Mumbai",
};

describe("Fix 1 (TADA): positiveMoney validation on TADA claims", () => {
  it("accepts zero expense values", () => {
    const result = tadaClaimCreateSchema.safeParse({
      ...validBase,
      travelExpense: 0,
      accommodationExp: 0,
      foodExpense: 0,
      localConveyance: 0,
      otherExpense: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts positive expense values", () => {
    const result = tadaClaimCreateSchema.safeParse({
      ...validBase,
      travelExpense: 500,
      accommodationExp: 2000,
      foodExpense: 300,
      localConveyance: 100,
      otherExpense: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative travelExpense", () => {
    const result = tadaClaimCreateSchema.safeParse({
      ...validBase,
      travelExpense: -50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative accommodationExp", () => {
    const result = tadaClaimCreateSchema.safeParse({
      ...validBase,
      accommodationExp: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative advanceAmount", () => {
    const result = tadaClaimCreateSchema.safeParse({
      ...validBase,
      advanceAmount: -500,
    });
    expect(result.success).toBe(false);
  });
});

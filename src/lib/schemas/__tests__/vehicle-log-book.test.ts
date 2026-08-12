import { describe, it, expect } from "vitest";
import { vehicleCreateSchema } from "@/lib/schemas/vehicle-log-book";

describe("Fix 4: Vehicle year validation — prevent future years", () => {
  const currentYear = new Date().getFullYear();

  it("accepts a past year", () => {
    const result = vehicleCreateSchema.safeParse({
      registrationNumber: "MH01AB1234",
      year: 2020,
    });
    expect(result.success).toBe(true);
  });

  it("accepts the current year + 1 (next year model)", () => {
    const result = vehicleCreateSchema.safeParse({
      registrationNumber: "MH01AB1234",
      year: currentYear + 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a far future year like 2040", () => {
    const result = vehicleCreateSchema.safeParse({
      registrationNumber: "MH01AB1234",
      year: 2040,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a year below 1900", () => {
    const result = vehicleCreateSchema.safeParse({
      registrationNumber: "MH01AB1234",
      year: 1899,
    });
    expect(result.success).toBe(false);
  });

  it("accepts null year", () => {
    const result = vehicleCreateSchema.safeParse({
      registrationNumber: "MH01AB1234",
      year: null,
    });
    expect(result.success).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { staffCreateSchema } from "@/lib/schemas/staff";

describe("Fix 10: Staff schema — isActive boolean field", () => {
  it("defaults isActive to true when not provided", () => {
    const result = staffCreateSchema.safeParse({
      name: "John Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it("accepts isActive: false", () => {
    const result = staffCreateSchema.safeParse({
      name: "John Doe",
      isActive: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
    }
  });

  it("accepts isActive: true", () => {
    const result = staffCreateSchema.safeParse({
      name: "John Doe",
      isActive: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  contractorCreateSchema,
  contractorUpdateSchema,
} from "@/lib/schemas/contractor";

describe("Fix 9: Contractor schema — update capability", () => {
  it("accepts a valid contractor create payload", () => {
    const result = contractorCreateSchema.safeParse({
      name: "ABC Contractors",
      contactPerson: "Jane",
      phone: "9876543210",
      contractAmount: 500000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a partial contractor update payload with id", () => {
    const result = contractorUpdateSchema.safeParse({
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      name: "Updated Contractor Name",
    });
    expect(result.success).toBe(true);
  });

  it("accepts updating contractAmount alone", () => {
    const result = contractorUpdateSchema.safeParse({
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      contractAmount: 750000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects contractor update without id", () => {
    const result = contractorUpdateSchema.safeParse({
      name: "No ID provided",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null for optional fields on update", () => {
    const result = contractorUpdateSchema.safeParse({
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      email: null,
      phone: null,
      agreementDate: null,
    });
    expect(result.success).toBe(true);
  });
});

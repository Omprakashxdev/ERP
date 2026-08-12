import { describe, it, expect } from "vitest";
import {
  inOutRegisterCreateSchema,
  inOutRegisterUpdateSchema,
} from "@/lib/schemas/in-out-register";

const validClientId = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
const today = new Date().toISOString().split("T")[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

const validBase = {
  direction: "INWARD" as const,
  documentDate: yesterday,
  receivedDate: today,
  documentRefNo: "DOC-001",
  clientId: validClientId,
};

describe("Fix 3: In-out register — future date validation", () => {
  it("rejects future documentDate", () => {
    const result = inOutRegisterCreateSchema.safeParse({
      ...validBase,
      documentDate: tomorrow,
    });
    expect(result.success).toBe(false);
  });

  it("rejects future receivedDate", () => {
    const result = inOutRegisterCreateSchema.safeParse({
      ...validBase,
      receivedDate: tomorrow,
    });
    expect(result.success).toBe(false);
  });

  it("accepts today dates", () => {
    const result = inOutRegisterCreateSchema.safeParse({
      ...validBase,
      documentDate: today,
      receivedDate: today,
    });
    expect(result.success).toBe(true);
  });

  it("rejects receivedDate before documentDate", () => {
    const result = inOutRegisterCreateSchema.safeParse({
      ...validBase,
      documentDate: today,
      receivedDate: yesterday,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("before document date"))).toBe(true);
    }
  });
});

describe("Fix 11: In-out register — reply date back date validation", () => {
  it("rejects replyDate before receivedDate on create", () => {
    const result = inOutRegisterCreateSchema.safeParse({
      ...validBase,
      replyDate: yesterday,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("before received/sent date"))).toBe(true);
    }
  });

  it("accepts replyDate equal to receivedDate", () => {
    const result = inOutRegisterCreateSchema.safeParse({
      ...validBase,
      replyDate: today,
    });
    expect(result.success).toBe(true);
  });

  it("accepts replyDate after receivedDate", () => {
    const result = inOutRegisterCreateSchema.safeParse({
      ...validBase,
      documentDate: new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0],
      receivedDate: yesterday,
      replyDate: today,
    });
    expect(result.success).toBe(true);
  });

  it("rejects replyDate before receivedDate on update", () => {
    const result = inOutRegisterUpdateSchema.safeParse({
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      receivedDate: today,
      replyDate: yesterday,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("before received/sent date"))).toBe(true);
    }
  });

  it("accepts valid replyDate on update", () => {
    const result = inOutRegisterUpdateSchema.safeParse({
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      receivedDate: yesterday,
      replyDate: today,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null replyDate on update", () => {
    const result = inOutRegisterUpdateSchema.safeParse({
      id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      replyDate: null,
    });
    expect(result.success).toBe(true);
  });
});

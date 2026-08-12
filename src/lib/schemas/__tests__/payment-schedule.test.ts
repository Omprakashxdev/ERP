import { describe, it, expect } from "vitest";
import { paymentScheduleCreateSchema } from "@/lib/schemas/payment-schedule";
import { PaymentScheduleStatus } from "@prisma/client";

describe("Fix 1: Payment schedule — positiveMoney validation", () => {
  it("accepts a zero amount", () => {
    const result = paymentScheduleCreateSchema.safeParse({
      amount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a positive amount", () => {
    const result = paymentScheduleCreateSchema.safeParse({
      amount: 1500.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative amount", () => {
    const result = paymentScheduleCreateSchema.safeParse({
      amount: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe("Fix 2: Payment schedule — back date & CANCELLED prevention", () => {
  it("rejects CANCELLED status on create", () => {
    const result = paymentScheduleCreateSchema.safeParse({
      amount: 100,
      status: PaymentScheduleStatus.CANCELLED,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("CANCELLED"))).toBe(true);
    }
  });

  it("accepts PENDING status on create", () => {
    const result = paymentScheduleCreateSchema.safeParse({
      amount: 100,
      status: PaymentScheduleStatus.PENDING,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const result = paymentScheduleCreateSchema.safeParse({
      amount: 100,
      date: future.toISOString().split("T")[0],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("future"))).toBe(true);
    }
  });

  it("accepts a past/today date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const result = paymentScheduleCreateSchema.safeParse({
      amount: 100,
      date: past.toISOString().split("T")[0],
    });
    expect(result.success).toBe(true);
  });
});

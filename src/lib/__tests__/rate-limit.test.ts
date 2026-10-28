import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryLimit, assertRateLimitConfig } from "@/lib/rate-limit";

describe("memoryLimit fallback limiter", () => {
  it("allows requests up to the limit then returns 429-shaped failure", () => {
    const id = `test-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      expect(memoryLimit(10, id).success).toBe(true);
    }
    const blocked = memoryLimit(10, id);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("tracks identifiers independently", () => {
    const a = `a-${Date.now()}`;
    const b = `b-${Date.now()}`;
    for (let i = 0; i < 10; i++) memoryLimit(10, a);
    expect(memoryLimit(10, a).success).toBe(false);
    expect(memoryLimit(10, b).success).toBe(true);
  });

  it("frees capacity after the window passes", () => {
    const id = `win-${Date.now()}`;
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 3; i++) memoryLimit(3, id);
      expect(memoryLimit(3, id).success).toBe(false);
      vi.advanceTimersByTime(61_000);
      expect(memoryLimit(3, id).success).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("assertRateLimitConfig production gate", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("no-ops outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertRateLimitConfig()).not.toThrow();
  });

  it("throws in production when Upstash is missing and no opt-in", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertRateLimitConfig()).toThrow(/RATE LIMITING UNCONFIGURED/);
  });

  it("warns instead of throwing when memory fallback is opted in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_FALLBACK", "memory");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertRateLimitConfig()).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertRateLimitConfig } = await import("@/lib/rate-limit");
    assertRateLimitConfig();
  }
}

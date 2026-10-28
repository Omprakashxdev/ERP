import { describe, it, expect, vi } from "vitest";

// Keep the real permission matrix under test while stubbing the
// runtime-only imports pulled in by authz.ts.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { hasPermission } from "@/lib/authz";
import { Role } from "@/types/auth";

describe("Progress App — permission matrix", () => {
  it("ADMIN can create, update and archive sites", () => {
    expect(hasPermission(Role.ADMIN, "progressApp", "create")).toBe(true);
    expect(hasPermission(Role.ADMIN, "progressApp", "update")).toBe(true);
    expect(hasPermission(Role.ADMIN, "progressApp", "delete")).toBe(true);
    expect(hasPermission(Role.ADMIN, "progressApp", "read")).toBe(true);
  });

  it("non-admin roles can read but cannot mutate", () => {
    for (const role of [Role.MANAGER, Role.STAFF, Role.AUDITOR]) {
      expect(hasPermission(role, "progressApp", "read")).toBe(true);
      expect(hasPermission(role, "progressApp", "create")).toBe(false);
      expect(hasPermission(role, "progressApp", "update")).toBe(false);
      expect(hasPermission(role, "progressApp", "delete")).toBe(false);
    }
  });
});

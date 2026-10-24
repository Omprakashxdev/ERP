import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "a@b.c", role: "ADMIN" } })),
}));
vi.mock("fs/promises", () => ({
  writeFile: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
  realpath: vi.fn(async (p: string) => require("path").resolve(p)),
}));
vi.mock("fs", () => ({ existsSync: vi.fn(() => true) }));

const makeReq = (module: string | null) => {
  const fd = new FormData();
  fd.append("file", new File(["hello"], "note.pdf", { type: "application/pdf" }));
  if (module !== null) fd.append("module", module);
  return { formData: async () => fd } as any;
};

describe("POST /api/upload — path regression", () => {
  it("returns /uploads/<module>/<file> — never '[object Object]'", async () => {
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(makeReq("tasks"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.path).toMatch(/^\/uploads\/tasks\/\d+_note\.pdf$/);
    expect(body.path).not.toContain("object Object");
  });
});

describe("POST /api/upload — module name validation", () => {
  it.each([
    ["plain id", "raBill1Path"],
    ["hyphenated", "in-out-register-doc"],
    ["underscored", "vehicle_log"],
  ])("accepts legitimate module names: %s", async (_label, module) => {
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(makeReq(module));
    expect(res.status).toBe(200);
  });

  it("defaults to 'general' when module is absent", async () => {
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(makeReq(null));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.path).toMatch(/^\/uploads\/general\//);
  });

  it.each([
    ["traversal", "../../etc"],
    ["nested traversal", "a/../../b"],
    ["absolute path", "/etc/passwd"],
    ["nested slash", "a/b"],
    ["backslash", "a\\b"],
    ["dot", "."],
    ["dotdot", ".."],
    ["leading separator", "/uploads"],
    ["empty", ""],
    ["space", "my module"],
    ["null byte", "a\0b"],
  ])("rejects unsafe module name: %s", async (_label, module) => {
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(makeReq(module));
    expect(res.status).toBe(400);
  });

  it("rejects a module dir resolving outside the upload root (planted symlink)", async () => {
    const fsMock = await import("fs/promises");
    const resolve = (p: unknown) => require("path").resolve(String(p));
    vi.mocked(fsMock.realpath).mockImplementation(async (p) =>
      String(p).endsWith("evilmod") ? "/etc/evilmod" : resolve(p)
    );
    try {
      vi.mocked(fsMock.writeFile).mockClear();
      const { POST } = await import("@/app/api/upload/route");
      const res = await POST(makeReq("evilmod"));
      expect(res.status).toBe(400);
      expect(vi.mocked(fsMock.writeFile)).not.toHaveBeenCalled();
    } finally {
      vi.mocked(fsMock.realpath).mockImplementation(async (p) => resolve(p));
    }
  });
});

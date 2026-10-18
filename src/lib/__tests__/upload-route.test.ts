import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "a@b.c", role: "ADMIN" } })),
}));
vi.mock("fs/promises", () => ({
  writeFile: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
}));
vi.mock("fs", () => ({ existsSync: vi.fn(() => true) }));

describe("POST /api/upload — path regression", () => {
  it("returns /uploads/<module>/<file> — never '[object Object]'", async () => {
    const { POST } = await import("@/app/api/upload/route");
    const fd = new FormData();
    fd.append("file", new File(["hello"], "note.pdf", { type: "application/pdf" }));
    fd.append("module", "tasks");
    const req = { formData: async () => fd } as any;
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.path).toMatch(/^\/uploads\/tasks\/\d+_note\.pdf$/);
    expect(body.path).not.toContain("object Object");
  });
});

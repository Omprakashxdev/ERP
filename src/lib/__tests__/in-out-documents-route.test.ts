import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn(async (..._a: any[]) => null as any);
const mockPerm = vi.fn(async (..._a: any[]) => false as any);
const mockReadFile = vi.fn(async (..._a: any[]) => Buffer.alloc(0));
const mockStat = vi.fn(async (..._a: any[]) => ({ size: 0 }) as any);
const mockWriteFile = vi.fn(async (..._a: any[]) => {});
const mockMkdir = vi.fn(async (..._a: any[]) => {});
const mockDocFindFirst = vi.fn(async (..._a: any[]) => null as any);
const mockPendingFind = vi.fn(async (..._a: any[]) => null as any);
const mockPendingCreate = vi.fn(async (..._a: any[]) => ({}));

vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("@/lib/authz", () => ({
  hasPermissionWithOverrides: (...args: unknown[]) => mockPerm(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inOutRegisterDocument: { findFirst: (...a: unknown[]) => mockDocFindFirst(...a) },
    pendingInOutUpload: {
      findUnique: (...a: unknown[]) => mockPendingFind(...a),
      create: (...a: unknown[]) => mockPendingCreate(...a),
    },
  },
}));
vi.mock("fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));
vi.mock("fs", () => ({ existsSync: vi.fn(() => true) }));

const ADMIN = { user: { id: "u1", email: "a@b.c", role: "ADMIN" } };
const OTHER = { user: { id: "u2", email: "b@c.d", role: "ADMIN" } };
const PRIV = "inout-priv/1792835073785_letter.pdf";
const LEGACY = "/uploads/in-out-register-doc/1700000000000_legacy.pdf";

function req(url: string) {
  return new NextRequest(`http://localhost:3000/api/in-out-documents${url}`);
}

describe("/api/in-out-documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(ADMIN);
    mockPerm.mockResolvedValue(true);
    mockDocFindFirst.mockResolvedValue(null);
    mockPendingFind.mockResolvedValue(null);
    mockReadFile.mockResolvedValue(Buffer.from("%PDF-1.4"));
    mockStat.mockResolvedValue({ size: 10 });
  });

  describe("GET — session and module permission", () => {
    it("rejects unauthenticated requests with 401", async () => {
      mockAuth.mockResolvedValue(null);
      const { GET } = await import("@/app/api/in-out-documents/route");
      expect((await GET(req(`?path=${encodeURIComponent(PRIV)}`))).status).toBe(401);
    });

    it("rejects users without inOutRegister read permission", async () => {
      mockPerm.mockResolvedValue(false);
      const { GET } = await import("@/app/api/in-out-documents/route");
      expect((await GET(req(`?path=${encodeURIComponent(PRIV)}`))).status).toBe(403);
    });

    it("checks the inOutRegister read permission", async () => {
      mockDocFindFirst.mockResolvedValue({ id: "d1" });
      const { GET } = await import("@/app/api/in-out-documents/route");
      await GET(req(`?path=${encodeURIComponent(PRIV)}&meta=1`));
      expect(mockPerm).toHaveBeenCalledWith("ADMIN", "inOutRegister", "read");
    });
  });

  describe("GET — path validation", () => {
    it.each([
      "",
      "inout-priv/../secret",
      "inout-priv/sub/dir/x.pdf",
      "/uploads/../../etc/passwd",
      "/etc/passwd",
      "C:\\Windows\\system32\\x.pdf",
    ])("rejects traversal/arbitrary path %j with 400", async (p) => {
      const { GET } = await import("@/app/api/in-out-documents/route");
      expect((await GET(req(`?path=${encodeURIComponent(p)}`))).status).toBe(400);
    });
  });

  describe("GET — per-document authorization", () => {
    it("serves a SAVED attachment linked to a register document", async () => {
      mockDocFindFirst.mockResolvedValue({ id: "d1" });
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(PRIV)}`));
      expect(res.status).toBe(200);
      expect(mockDocFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { path: PRIV } })
      );
      expect(mockReadFile.mock.calls[0][0] as string).toContain("private_uploads");
    });

    it("serves the uploader's OWN unsaved pending file", async () => {
      mockPendingFind.mockResolvedValue({ uploadedById: "u1" });
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(PRIV)}`));
      expect(res.status).toBe(200);
    });

    it("rejects ANOTHER user's pending file even with the exact path", async () => {
      mockPendingFind.mockResolvedValue({ uploadedById: "u2" });
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(PRIV)}`));
      expect(res.status).toBe(403);
    });

    it("rejects an unlinked private filename", async () => {
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent("inout-priv/999_guessed.pdf")}`));
      expect(res.status).toBe(403);
    });

    it("rejects a file from another module's uploads (no register link)", async () => {
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(
        req(`?path=${encodeURIComponent("/uploads/raBill1Path/1792490149296_ERP.pdf")}`)
      );
      expect(res.status).toBe(403);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("serves a LEGACY /uploads/ path only when linked to a register document", async () => {
      mockDocFindFirst.mockResolvedValue({ id: "d1" });
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(LEGACY)}`));
      expect(res.status).toBe(200);
      expect(mockReadFile.mock.calls[0][0] as string).toContain("public");
    });

    it("rejects an unlinked legacy /uploads/ path", async () => {
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(LEGACY)}`));
      expect(res.status).toBe(403);
    });
  });

  describe("GET — responses", () => {
    beforeEach(() => mockDocFindFirst.mockResolvedValue({ id: "d1" }));

    it("returns a helpful 404 when the linked file is missing on disk", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(PRIV)}`));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/could not be found/i);
    });

    it("serves PDFs inline with the correct Content-Type", async () => {
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(PRIV)}`));
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(res.headers.get("Content-Disposition")).toMatch(/^inline; filename="letter\.pdf"/);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("forces attachment disposition when download=1", async () => {
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(PRIV)}&download=1`));
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    });

    it("meta=1 checks existence without reading file contents", async () => {
      mockStat.mockResolvedValue({ size: 42 });
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(PRIV)}&meta=1`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ filename: "letter.pdf", size: 42 });
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("meta=1 also requires document authorization", async () => {
      mockDocFindFirst.mockResolvedValue(null);
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(PRIV)}&meta=1`));
      expect(res.status).toBe(403);
    });
  });

  describe("POST — upload to private storage", () => {
    function uploadReq() {
      const fd = new FormData();
      fd.append("file", new File(["%PDF-1.4"], "letter.pdf", { type: "application/pdf" }));
      return { formData: async () => fd } as unknown as NextRequest;
    }

    it("rejects unauthenticated uploads with 401", async () => {
      mockAuth.mockResolvedValue(null);
      const { POST } = await import("@/app/api/in-out-documents/route");
      expect((await POST(uploadReq())).status).toBe(401);
    });

    it("rejects users without create permission with 403", async () => {
      mockPerm.mockResolvedValue(false);
      const { POST } = await import("@/app/api/in-out-documents/route");
      expect((await POST(uploadReq())).status).toBe(403);
    });

    it("stores files in private_uploads and returns an inout-priv/ path", async () => {
      const { POST } = await import("@/app/api/in-out-documents/route");
      const res = await POST(uploadReq());
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.path).toMatch(/^inout-priv\/\d+_letter\.pdf$/);
      expect(mockWriteFile.mock.calls[0][0] as string).toContain("private_uploads");
      expect(mockWriteFile.mock.calls[0][0] as string).not.toContain("public");
    });

    it("binds the upload to the uploading user (pending record)", async () => {
      const { POST } = await import("@/app/api/in-out-documents/route");
      await POST(uploadReq());
      expect(mockPendingCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ uploadedById: "u1" }),
      });
    });

    it("a different user's session cannot read the fresh upload", async () => {
      mockAuth.mockResolvedValue(OTHER);
      mockPendingFind.mockResolvedValue({ uploadedById: "u1" });
      const { GET } = await import("@/app/api/in-out-documents/route");
      const res = await GET(req(`?path=${encodeURIComponent(PRIV)}`));
      expect(res.status).toBe(403);
    });

    it("rejects disallowed file types", async () => {
      const fd = new FormData();
      fd.append("file", new File(["x"], "evil.exe", { type: "application/x-msdownload" }));
      const { POST } = await import("@/app/api/in-out-documents/route");
      const res = await POST({ formData: async () => fd } as unknown as NextRequest);
      expect(res.status).toBe(400);
    });

    it("strips directory components from uploaded filenames", async () => {
      const fd = new FormData();
      fd.append("file", new File(["x"], "../../etc/letter.pdf", { type: "application/pdf" }));
      const { POST } = await import("@/app/api/in-out-documents/route");
      const res = await POST({ formData: async () => fd } as unknown as NextRequest);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.path).toMatch(/^inout-priv\/\d+_letter\.pdf$/);
    });
  });
});

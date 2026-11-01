import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@/types/auth";
import { hasPermission } from "@/lib/authz";
import {
  inOutRegisterCreateSchema,
  inOutRegisterUpdateSchema,
  inOutRegisterFilterSchema,
} from "@/lib/schemas/in-out-register";
import { buildInOutRegisterWhere } from "@/lib/queries/in-out-register";
import {
  createInOutRegister,
  updateInOutRegister,
  getInOutRegisters,
} from "@/lib/actions/in-out-register";
import { prisma } from "@/lib/prisma";

const VALID_CLIENT_ID = "cm00000000000000000000002";
const OTHER_CLIENT_ID = "cm00000000000000000000009";
const VALID_STAFF_ID = "cm00000000000000000000003";
const VALID_PROJECT_ID = "cm00000000000000000000004";
const OTHER_CLIENT_PROJECT_ID = "cm00000000000000000000005";
const ENTRY_ID = "cm00000000000000000000006";

const mockTx = {
  $queryRaw: vi.fn(async () => [{ lastSeq: 7 }]),
  inOutRegister: {
    create: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    inOutRegister: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    inOutRegisterDocument: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    inOutRegisterCcStaff: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    pendingInOutUpload: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({})),
    },
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    staff: {
      findUnique: vi.fn(async () => ({ id: VALID_STAFF_ID, isActive: true })),
    },
    modeMaster: {
      findUnique: vi.fn(),
    },
    task: {
      count: vi.fn(async () => 0),
    },
  },
}));

let currentUser: { id: string; role: Role } = { id: "u-admin", role: Role.ADMIN };

vi.mock("@/lib/actions/wrapper", () => ({
  withAuth: vi.fn(async (fn: (u: typeof currentUser) => Promise<unknown>, allowedRoles?: Role[]) => {
    if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
      return { success: false, error: "Forbidden" };
    }
    try {
      return { success: true, data: await fn(currentUser) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
  }),
  withPermission: vi.fn(async (resource: string, action: string, fn: (u: typeof currentUser) => Promise<unknown>) => {
    if (!hasPermission(currentUser.role, resource, action)) {
      return { success: false, error: "Forbidden" };
    }
    try {
      return { success: true, data: await fn(currentUser) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
  }),
  checkRateLimit: vi.fn(),
  audit: vi.fn(),
  sanitizeForAudit: vi.fn(async (x: unknown) => x),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/actions/task-linking", () => ({
  createInOutRegisterLinkedTasks: vi.fn(async () => {}),
  deleteLinkedTasks: vi.fn(async () => {}),
}));

const baseCreate = {
  direction: "INWARD" as const,
  documentDate: new Date("2026-05-01T00:00:00Z"),
  receivedDate: new Date("2026-05-02T00:00:00Z"),
  documentRefNo: "SMC/TEST/2026/001",
  details: "Test letter",
  clientId: VALID_CLIENT_ID,
  actionSuggestedStaffId: VALID_STAFF_ID,
};

function mockProjectLookup() {
  vi.mocked(prisma.project.findUnique).mockImplementation((async (
    args: unknown
  ) => {
    const id = (args as { where: { id: string } }).where.id;
    if (id === VALID_PROJECT_ID) {
      return { id, clientId: VALID_CLIENT_ID };
    }
    if (id === OTHER_CLIENT_PROJECT_ID) {
      return { id, clientId: OTHER_CLIENT_ID };
    }
    return null;
  }) as never);
}

describe("Brick 2 — Inward Project Association", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: "u-admin", role: Role.ADMIN };
    mockProjectLookup();
    vi.mocked(prisma.inOutRegister.findFirst).mockResolvedValue(null);
    mockTx.inOutRegister.create.mockImplementation(async ({ data }: never) => ({
      id: ENTRY_ID,
      ...(data as Record<string, unknown>),
    }));
  });

  describe("schema validation", () => {
    it("accepts an INWARD entry with a projectId", () => {
      const parsed = inOutRegisterCreateSchema.parse({
        ...baseCreate,
        documentDate: "2026-05-01",
        receivedDate: "2026-05-02",
        projectId: VALID_PROJECT_ID,
      });
      expect(parsed.projectId).toBe(VALID_PROJECT_ID);
    });

    it("accepts an INWARD entry without a project (general correspondence)", () => {
      const parsed = inOutRegisterCreateSchema.parse({
        ...baseCreate,
        documentDate: "2026-05-01",
        receivedDate: "2026-05-02",
      });
      expect(parsed.projectId).toBeUndefined();
    });

    it("rejects projectId on OUTWARD entries", () => {
      expect(() =>
        inOutRegisterCreateSchema.parse({
          ...baseCreate,
          direction: "OUTWARD",
          documentDate: "2026-05-01",
          receivedDate: "2026-05-02",
          projectId: VALID_PROJECT_ID,
        })
      ).toThrow(/inward/i);
    });

    it("filter schema accepts projectId and the where-builder applies it", () => {
      const filter = inOutRegisterFilterSchema.parse({ projectId: VALID_PROJECT_ID });
      const where = buildInOutRegisterWhere(filter) as { AND: Record<string, unknown>[] };
      expect(where.AND).toContainEqual({ projectId: VALID_PROJECT_ID });
    });
  });

  describe("createInOutRegister", () => {
    it("saves a Masters-created project on an inward entry", async () => {
      const res = await createInOutRegister({
        ...baseCreate,
        projectId: VALID_PROJECT_ID,
      } as never);

      expect(res.success).toBe(true);
      expect(mockTx.inOutRegister.create).toHaveBeenCalledTimes(1);
      const createArg = mockTx.inOutRegister.create.mock.calls[0][0] as {
        data: { projectId?: string; serialNo?: string };
      };
      expect(createArg.data.projectId).toBe(VALID_PROJECT_ID);
      expect(createArg.data.serialNo).toMatch(/^INW\//);
    });

    it("allows general correspondence with no project", async () => {
      const res = await createInOutRegister({ ...baseCreate } as never);
      expect(res.success).toBe(true);
      const createArg = mockTx.inOutRegister.create.mock.calls[0][0] as {
        data: { projectId?: string | null };
      };
      expect(createArg.data.projectId ?? null).toBeNull();
    });

    it("rejects a project belonging to a different client", async () => {
      const res = await createInOutRegister({
        ...baseCreate,
        projectId: OTHER_CLIENT_PROJECT_ID,
      } as never);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/different client/i);
      expect(mockTx.inOutRegister.create).not.toHaveBeenCalled();
    });

    it("rejects a nonexistent project", async () => {
      const res = await createInOutRegister({
        ...baseCreate,
        projectId: "cm00000000000000000000999",
      } as never);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/does not exist/i);
      expect(mockTx.inOutRegister.create).not.toHaveBeenCalled();
    });
  });

  describe("updateInOutRegister", () => {
    const existingInward = {
      id: ENTRY_ID,
      direction: "INWARD",
      clientId: VALID_CLIENT_ID,
      documentRefNo: "SMC/TEST/2026/001",
      actionSuggestedStaffId: VALID_STAFF_ID,
      modeId: null,
      receivedByStaffId: null,
      inwardType: null,
      parentInwardId: null,
      projectId: null,
      documents: [],
      ccStaff: [],
    };

    beforeEach(() => {
      vi.mocked(prisma.inOutRegister.findUnique).mockResolvedValue(
        existingInward as never
      );
      vi.mocked(prisma.inOutRegister.update).mockImplementation((async (
        args: unknown
      ) => ({ id: ENTRY_ID, ...((args as { data: object }).data) })) as never);
    });

    it("links a matching-client project on edit", async () => {
      const res = await updateInOutRegister({
        id: ENTRY_ID,
        projectId: VALID_PROJECT_ID,
      } as never);

      expect(res.success).toBe(true);
      const updateArg = vi.mocked(prisma.inOutRegister.update).mock.calls[0][0] as {
        data: { projectId?: string };
      };
      expect(updateArg.data.projectId).toBe(VALID_PROJECT_ID);
    });

    it("rejects linking a project from a different client", async () => {
      const res = await updateInOutRegister({
        id: ENTRY_ID,
        projectId: OTHER_CLIENT_PROJECT_ID,
      } as never);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/different client/i);
      expect(prisma.inOutRegister.update).not.toHaveBeenCalled();
    });

    it("rejects setting a project on an OUTWARD entry", async () => {
      vi.mocked(prisma.inOutRegister.findUnique).mockResolvedValue({
        ...existingInward,
        direction: "OUTWARD",
      } as never);

      const res = await updateInOutRegister({
        id: ENTRY_ID,
        projectId: VALID_PROJECT_ID,
      } as never);

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/inward entries/i);
      expect(prisma.inOutRegister.update).not.toHaveBeenCalled();
    });

    it("clears the project link when projectId is set to null", async () => {
      vi.mocked(prisma.inOutRegister.findUnique).mockResolvedValue({
        ...existingInward,
        projectId: VALID_PROJECT_ID,
      } as never);

      const res = await updateInOutRegister({
        id: ENTRY_ID,
        projectId: null,
      } as never);

      expect(res.success).toBe(true);
      const updateArg = vi.mocked(prisma.inOutRegister.update).mock.calls[0][0] as {
        data: { projectId?: string | null };
      };
      expect(updateArg.data.projectId).toBeNull();
    });

    it("clears projectId when direction is flipped to OUTWARD", async () => {
      vi.mocked(prisma.inOutRegister.findUnique).mockResolvedValue({
        ...existingInward,
        projectId: VALID_PROJECT_ID,
      } as never);

      const res = await updateInOutRegister({
        id: ENTRY_ID,
        direction: "OUTWARD",
      } as never);

      expect(res.success).toBe(true);
      const updateArg = vi.mocked(prisma.inOutRegister.update).mock.calls[0][0] as {
        data: { projectId?: string | null; direction?: string };
      };
      expect(updateArg.data.projectId).toBeNull();
    });
  });

  describe("getInOutRegisters", () => {
    it("returns rows with own project and parent inward project included", async () => {
      vi.mocked(prisma.inOutRegister.findMany).mockResolvedValue([
        {
          id: ENTRY_ID,
          direction: "INWARD",
          receivedDate: new Date("2026-05-02T00:00:00Z"),
          project: { id: VALID_PROJECT_ID, name: "Brick2 Project", abbreviation: "B2P" },
          parentInward: null,
          replies: [],
          ccStaff: [],
        },
        {
          id: "cm00000000000000000000007",
          direction: "OUTWARD",
          receivedDate: new Date("2026-05-03T00:00:00Z"),
          project: null,
          parentInward: {
            id: ENTRY_ID,
            project: { id: VALID_PROJECT_ID, name: "Brick2 Project" },
          },
          replies: [],
          ccStaff: [],
        },
      ] as never);
      vi.mocked(prisma.inOutRegister.count).mockResolvedValue(2);

      const res = await getInOutRegisters();
      expect(res.success).toBe(true);
      const rows = (res.data as {
        rows: {
          project?: { name: string } | null;
          parentInward?: { project?: { name: string } | null } | null;
        }[];
      }).rows;
      expect(rows[0].project?.name).toBe("Brick2 Project");
      expect(rows[1].parentInward?.project?.name).toBe("Brick2 Project");
    });
  });
});

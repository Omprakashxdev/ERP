import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    staff: { findFirst: vi.fn(), findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

const prismaMock = prisma as any;
const TENDER_ID = "ctnd000000000000000000001";
const REG_ID = "creg000000000000000000001";
const STAFF_A = "csta000000000000000000001";
const STAFF_B = "cstb000000000000000000001";

describe("Task.sourceEventKey identity (Phase 5A)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.task.create.mockResolvedValue({ id: "t-new" });
    prismaMock.task.updateMany.mockResolvedValue({ count: 1 });
  });

  it("keyed dedup ignores the title — a renamed task cannot duplicate", async () => {
    const { createLinkedTask } = await import("../actions/task-linking");
    // A keyed task exists (its title was renamed by the employee)
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: "t-existing" });

    await createLinkedTask({
      title: "Bidding last date — New Tender",
      description: "x",
      dueDate: null,
      sourceModule: "TENDER",
      sourceEntityId: TENDER_ID,
      sourceEventKey: "bidding_last",
      assignedToId: STAFF_A,
    });

    expect(prismaMock.task.create).not.toHaveBeenCalled();
    // the dedup query must NOT filter on title
    const where = prismaMock.task.findFirst.mock.calls[0][0].where;
    expect(where.sourceEventKey).toBe("bidding_last");
    expect(where).not.toHaveProperty("title");
  });

  it("repeat saves are idempotent", async () => {
    const { createLinkedTask } = await import("../actions/task-linking");
    prismaMock.task.findFirst
      .mockResolvedValueOnce(null) // first save: nothing exists
      .mockResolvedValueOnce({ id: "t-existing" }); // second save
    prismaMock.task.findMany.mockResolvedValue([]);

    const input = {
      title: "X",
      description: "x",
      dueDate: null,
      sourceModule: "TENDER",
      sourceEntityId: TENDER_ID,
      sourceEventKey: "emd_return",
      assignedToId: STAFF_A,
    };
    await createLinkedTask(input);
    await createLinkedTask(input);
    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
  });

  it("concurrent P2002 → fetches the keyed task and dedupes", async () => {
    const { createLinkedTask } = await import("../actions/task-linking");
    prismaMock.task.create.mockRejectedValue({ code: "P2002" });
    prismaMock.task.findFirst
      .mockResolvedValueOnce(null) // initial keyed check
      .mockResolvedValueOnce({ id: "t-race" }); // post-P2002 lookup

    await createLinkedTask({
      title: "X",
      description: "x",
      dueDate: null,
      sourceModule: "TENDER",
      sourceEntityId: TENDER_ID,
      sourceEventKey: "opening",
      assignedToId: STAFF_A,
    });
    // no throw; raced task treated as existing
  });

  it("unrelated P2002/error rethrows", async () => {
    const { createLinkedTask } = await import("../actions/task-linking");
    prismaMock.task.create.mockRejectedValue({ code: "P2002" });
    prismaMock.task.findFirst.mockResolvedValue(null); // keyed task absent
    await expect(
      createLinkedTask({
        title: "X",
        description: "x",
        dueDate: null,
        sourceModule: "TENDER",
        sourceEntityId: TENDER_ID,
        sourceEventKey: "opening",
        assignedToId: STAFF_A,
      })
    ).rejects.toEqual({ code: "P2002" });
  });

  it("keyed task without sourceModule/entityId is rejected", async () => {
    const { createLinkedTask } = await import("../actions/task-linking");
    await expect(
      createLinkedTask({
        title: "X",
        description: "x",
        dueDate: null,
        sourceModule: "",
        sourceEntityId: TENDER_ID,
        sourceEventKey: "opening",
      } as any)
    ).rejects.toThrow("sourceModule");
  });

  it("two tender events → two independent tasks", async () => {
    const { createTenderLinkedTasks } = await import("../actions/task-linking");
    await createTenderLinkedTasks({
      tenderId: TENDER_ID,
      tenderName: "T",
      biddingLastDate: new Date("2026-11-01"),
      dateOfOpening: new Date("2026-11-05"),
      concernAuthorityId: STAFF_A,
    });
    const keys = prismaMock.task.create.mock.calls.map(
      (c: any) => c[0].data.sourceEventKey
    );
    expect(keys.sort()).toEqual(["bidding_last", "opening"]);
  });

  it("in-out action + CC tasks keep distinct identities per staff", async () => {
    const { createInOutRegisterLinkedTasks } = await import("../actions/task-linking");
    await createInOutRegisterLinkedTasks({
      inOutRegisterId: REG_ID,
      documentRefNo: "X/001",
      actionSuggestedStaffId: STAFF_A,
      ccStaffIds: [STAFF_A, STAFF_B],
    });
    const keys = prismaMock.task.create.mock.calls.map(
      (c: any) => c[0].data.sourceEventKey
    );
    // action:<A> + cc:<B> — CC to the action assignee is skipped, A and B distinct
    expect(keys.sort()).toEqual([`action:${STAFF_A}`, `cc:${STAFF_B}`]);
  });

  it("WIP events get independent stable keys", async () => {
    const { createWipLinkedTasks } = await import("../actions/task-linking");
    prismaMock.project.findUnique.mockResolvedValue({ name: "Proj" });
    prismaMock.staff.findFirst.mockResolvedValue({ id: STAFF_A }); // fallback assignee
    await createWipLinkedTasks({
      wipId: "cwip000000000000000000001",
      projectId: "cprj000000000000000000001",
      loiReceiptDate: new Date("2026-10-01"),
      raBill2Date: new Date("2026-10-10"),
      raBill2Amount: 5000,
      hoCoordinatorId: STAFF_A,
    } as any);
    const keys = prismaMock.task.create.mock.calls.map(
      (c: any) => c[0].data.sourceEventKey
    );
    expect(keys.sort()).toEqual(["loi", "ra_bill_2"]);
  });

  it("adopts exactly one unkeyed legacy match — never creates a duplicate", async () => {
    const { createLinkedTask } = await import("../actions/task-linking");
    prismaMock.task.findFirst.mockResolvedValue(null); // no keyed task
    prismaMock.task.findMany.mockResolvedValue([{ id: "t-legacy" }]);

    await createLinkedTask({
      title: "Bidding last date — T",
      description: "x",
      dueDate: null,
      sourceModule: "TENDER",
      sourceEntityId: TENDER_ID,
      sourceEventKey: "bidding_last",
      assignedToId: STAFF_A,
    });

    expect(prismaMock.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t-legacy", sourceEventKey: null },
        data: { sourceEventKey: "bidding_last" },
      })
    );
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("ambiguous legacy matches → reported, no task created, nothing touched", async () => {
    const { createLinkedTask } = await import("../actions/task-linking");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.task.findMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);

    await createLinkedTask({
      title: "Bidding last date — T",
      description: "x",
      dueDate: null,
      sourceModule: "TENDER",
      sourceEntityId: TENDER_ID,
      sourceEventKey: "bidding_last",
      assignedToId: STAFF_A,
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Ambiguous"));
    expect(prismaMock.task.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.task.create).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("payment schedule keeps one-task-per-schedule identity", async () => {
    const { createPaymentScheduleLinkedTask } = await import("../actions/task-linking");
    prismaMock.task.findFirst.mockResolvedValue({ id: "t-ps" });
    const res = await createPaymentScheduleLinkedTask({
      scheduleId: "cps0000000000000000000001",
      category: "GST",
      dueDate: new Date(),
      assignedToId: STAFF_A,
    });
    expect(res).toBe("t-ps");
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });
});

describe("Missing-assignee handling (Phase 5B)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.task.create.mockResolvedValue({ id: "t-new" });
    prismaMock.user.findMany.mockResolvedValue([{ id: "u-admin" }]);
    prismaMock.notification.create.mockResolvedValue({});
  });

  it("WIP with no coordinator → no task, no first-staff fallback, admins notified", async () => {
    const { createWipLinkedTasks } = await import("../actions/task-linking");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    prismaMock.project.findUnique.mockResolvedValue({ name: "Proj" });
    // no coordinators — the old code would assign the task to the first
    // active staff member; now nothing is created and admins are alerted.
    await createWipLinkedTasks({
      wipId: "cwip000000000000000000001",
      projectId: "cprj000000000000000000001",
      loiReceiptDate: new Date("2026-10-01"),
      hoCoordinatorId: null,
      roCoordinatorId: null,
    } as any);

    expect(prismaMock.staff.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.task.create).not.toHaveBeenCalled();
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u-admin",
          title: "Follow-up task not created — no assignee",
        }),
      })
    );
    warn.mockRestore();
  });

  it("valid HO coordinator → task created for exactly that staff", async () => {
    const { createWipLinkedTasks } = await import("../actions/task-linking");
    prismaMock.project.findUnique.mockResolvedValue({ name: "Proj" });
    await createWipLinkedTasks({
      wipId: "cwip000000000000000000001",
      projectId: "cprj000000000000000000001",
      loiReceiptDate: new Date("2026-10-01"),
      hoCoordinatorId: STAFF_A,
      roCoordinatorId: STAFF_B,
    } as any);
    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.create.mock.calls[0][0].data.assignedToId).toBe(STAFF_A);
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("existing keyed task is preserved — never re-created or reassigned", async () => {
    const { createWipLinkedTasks } = await import("../actions/task-linking");
    prismaMock.project.findUnique.mockResolvedValue({ name: "Proj" });
    prismaMock.task.findFirst.mockImplementation(async ({ where }: any) =>
      where.sourceEventKey === "loi" ? { id: "t-loi" } : null
    );
    await createWipLinkedTasks({
      wipId: "cwip000000000000000000001",
      projectId: "cprj000000000000000000001",
      loiReceiptDate: new Date("2026-10-01"),
      hoCoordinatorId: STAFF_B, // coordinator changed — existing task untouched
    } as any);
    expect(prismaMock.task.create).not.toHaveBeenCalled();
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("tender still gates on explicit concern authority — unaffected", async () => {
    const { createTenderLinkedTasks } = await import("../actions/task-linking");
    await createTenderLinkedTasks({
      tenderId: TENDER_ID,
      tenderName: "T",
      biddingLastDate: new Date("2026-11-01"),
      concernAuthorityId: null, // gate: no person → no task, no notify needed
    });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });
});

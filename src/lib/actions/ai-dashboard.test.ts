import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  loadDashboardMetrics,
  buildDashboardPrompt,
  generateDashboardSummary,
  DashboardMetrics,
} from "./ai-dashboard";
import { prisma } from "@/lib/prisma";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/groq", () => ({
  getGroqChatModel: vi.fn().mockReturnValue("mock-groq-model"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    dueBill: {
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    task: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    tadaClaim: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    tender: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    fundFlow: {
      findMany: vi.fn(),
    },
    vehicle: {
      count: vi.fn(),
    },
    paymentSchedule: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    contractor: {
      count: vi.fn(),
    },
    systemSetting: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/authz", () => ({
  requireAuth: vi.fn(),
  hasPermission: vi.fn(),
}));

import { generateText } from "ai";
import { requireAuth, hasPermission } from "@/lib/authz";

function dec(value: string | number): Decimal {
  return new Decimal(String(value));
}

function mockPrismaForMinimalMetrics() {
  vi.mocked(prisma.project.count).mockResolvedValue(0);
  vi.mocked(prisma.project.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
    _sum: { billAmount: null, receivedAmount: null },
  } as any);
  vi.mocked(prisma.dueBill.count).mockResolvedValue(0);
  vi.mocked(prisma.dueBill.findMany).mockResolvedValue([]);
  vi.mocked(prisma.task.count).mockResolvedValue(0);
  vi.mocked(prisma.task.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.tadaClaim.count).mockResolvedValue(0);
  vi.mocked(prisma.tadaClaim.aggregate).mockResolvedValue({
    _sum: { totalClaimAmount: null },
  } as any);
  vi.mocked(prisma.tender.count).mockResolvedValue(0);
  vi.mocked(prisma.tender.findMany).mockResolvedValue([]);
  vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([]);
  vi.mocked(prisma.vehicle.count).mockResolvedValue(0);
  vi.mocked(prisma.paymentSchedule.findMany).mockResolvedValue([]);
  vi.mocked(prisma.paymentSchedule.count).mockResolvedValue(0);
  vi.mocked(prisma.contractor.count).mockResolvedValue(0);
}

describe("loadDashboardMetrics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrismaForMinimalMetrics();
  });

  it("includes legacy feeReceivedLabel and receivedLabel in fundFlow metrics (T45)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      {
        id: "ff-1",
        projectId: "p1",
        totalProjectCost: dec("500000"),
        completedWorkAmt: dec("200000"),
        feeReceived: dec("100000"),
        project: { name: "Project A" },
      },
    ] as any);

    const metrics = await loadDashboardMetrics();

    expect(metrics.fundFlow.feeReceivedLabel).toContain("LEGACY");
    expect(metrics.fundFlow.feeReceivedLabel).toContain("unverified");
    expect(metrics.fundFlow.topProjects.length).toBe(1);
    expect(metrics.fundFlow.topProjects[0].receivedLabel).toContain("Legacy unverified");
  });

  it("handles empty fundFlow data gracefully (T46)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([]);

    const metrics = await loadDashboardMetrics();

    expect(metrics.fundFlow.feeReceived).toBe(0);
    expect(metrics.fundFlow.feeReceivedLabel).toContain("LEGACY");
    expect(metrics.fundFlow.topProjects).toEqual([]);
  });
});

describe("buildDashboardPrompt", () => {
  it("serializes legacy labels into the prompt JSON (T47)", async () => {
    const metrics: DashboardMetrics = {
      projects: { total: 1, active: 1, byStatus: {} },
      dueBills: {
        totalBilled: 0,
        totalReceived: 0,
        pendingCount: 0,
        pendingAmount: 0,
        overdueCount: 0,
        largestPending: [],
      },
      tasks: { open: 0, overdue: 0, highPriority: 0, byStatus: {} },
      tadaClaims: { pending: 0, totalAmount: 0 },
      tenders: { active: 0, upcomingDeadlines: [] },
      fundFlow: {
        totalProjectCost: 0,
        completedWorkAmt: 0,
        feeReceived: 0,
        feeReceivedLabel:
          "LEGACY — FundFlow.feeReceived is a legacy unverified field.",
        topProjects: [
          {
            name: "Project A",
            cost: 0,
            completed: 0,
            received: 0,
            receivedLabel: "Legacy unverified — see feeReceivedLabel",
          },
        ],
      },
      vehicles: { active: 0, insuranceExpiring: 0 },
      paymentSchedules: { upcoming: [], overdue: 0 },
      contractors: { total: 0, missingDocs: 0 },
    };

    const prompt = await buildDashboardPrompt(metrics);

    expect(prompt).toContain("LEGACY");
    expect(prompt).toContain("unverified");
    expect(prompt).toContain("feeReceivedLabel");
    expect(prompt).toContain("receivedLabel");
    expect(prompt).toContain("Project A");
  });
});

describe("generateDashboardSummary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrismaForMinimalMetrics();
  });

  it("rejects users without reports read permission (T48)", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      id: "user-1",
      role: "STAFF",
      name: "Staff User",
    } as any);
    vi.mocked(hasPermission).mockReturnValue(false);

    const result = await generateDashboardSummary();
    expect(result.success).toBe(false);
    expect(result.error).toBe("You don't have permission to view reports.");
  });

  it("rejects users without AI assistant access (T49)", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      id: "user-1",
      role: "STAFF",
      name: "Staff User",
    } as any);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(prisma.systemSetting.findUnique).mockResolvedValue({
      key: "ai_allowed_roles",
      value: "ADMIN,MANAGER",
    } as any);

    const result = await generateDashboardSummary();
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "AI assistant access is restricted. Contact your administrator."
    );
  });

  it("returns AI summary when authorized and AI access is allowed (T50)", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      id: "user-1",
      role: "ADMIN",
      name: "Admin User",
    } as any);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(prisma.systemSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([]);
    vi.mocked(generateText).mockResolvedValue({
      text: "## Priority Actions\n- **[CRITICAL]**: Legacy unverified fee received of ₹0",
    } as any);

    const result = await generateDashboardSummary();
    expect(result.success).toBe(true);
    expect(result.data).toContain("Priority Actions");

    // Verify the system prompt contains the critical financial data rule
    const generateCall = vi.mocked(generateText).mock.calls[0][0] as {
      system: string;
      prompt: string;
    };
    expect(generateCall.system).toContain("CRITICAL FINANCIAL DATA RULE");
    expect(generateCall.system).toContain("legacy unverified");
    expect(generateCall.prompt).toContain("feeReceivedLabel");
  });
});

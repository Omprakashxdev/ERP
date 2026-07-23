import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { AiDashboardSummary } from "./ai-summary";
import {
  FileText,
  ClipboardList,
  CheckSquare,
  ReceiptText,
  Car,
  Box,
  Landmark,
  Hammer,
  HardHat,
  ArrowRight,
  TrendingUp,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { allNavItems } from "@/lib/nav";

export default async function DashboardPage() {
  const session = await auth();
  const userName = session?.user?.name ?? session?.user?.email ?? "User";

  const [
    projectCount,
    activeProjects,
    dueBillsPending,
    dueBillsTotal,
    dueBillsReceived,
    openTasks,
    pendingTadaClaims,
    activeTenders,
    activeVehicles,
    totalAssets,
    fundFlowCount,
    wipCount,
    dueBillsByProject,
    taskStatusCounts,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.dueBill.aggregate({
      _sum: { billAmount: true, receivedAmount: true },
      where: { status: { in: ["PENDING", "PARTIAL"] } },
    }),
    prisma.dueBill.aggregate({ _sum: { billAmount: true } }),
    prisma.dueBill.aggregate({ _sum: { receivedAmount: true } }),
    prisma.task.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "ON_HOLD"] } } }),
    prisma.tadaClaim.count({ where: { status: { in: ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "ACCOUNTS_VERIFIED", "FINANCE_APPROVED"] } } }),
    prisma.tender.count({ where: { status: { in: ["UNDER_PREPARATION", "SUBMITTED", "UNDER_EVALUATION"] } } }),
    prisma.vehicle.count({ where: { status: "ACTIVE" } }),
    prisma.asset.count(),
    prisma.fundFlow.count(),
    prisma.workInProgress.count(),
    prisma.dueBill.findMany({
      include: { project: { select: { name: true } } },
      orderBy: { billAmount: "desc" },
      take: 6,
    }),
    prisma.task.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  const pendingAmount = Number(dueBillsPending._sum.billAmount ?? 0) - Number(dueBillsPending._sum.receivedAmount ?? 0);
  const totalBilled = Number(dueBillsTotal._sum.billAmount ?? 0);
  const totalReceived = Number(dueBillsReceived._sum.receivedAmount ?? 0);
  const realizationRate = totalBilled > 0 ? (totalReceived / totalBilled) * 100 : 0;

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Financial highlight cards — the 3 numbers that matter most
  const financialHighlights = [
    {
      label: "Total Billed",
      value: `₹${totalBilled.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      sub: `₹${totalReceived.toLocaleString("en-IN", { maximumFractionDigits: 0 })} received (${realizationRate.toFixed(0)}%)`,
      icon: TrendingUp,
      color: "text-teal-700",
      bg: "bg-teal-50",
      border: "border-teal-200",
      href: "/dashboard/due-bills",
    },
    {
      label: "Pending Collection",
      value: `₹${pendingAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      sub: "Outstanding from clients",
      icon: Wallet,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
      href: "/dashboard/due-bills",
    },
    {
      label: "Open Tasks",
      value: `${openTasks}`,
      sub: "Tasks in progress",
      icon: CheckSquare,
      color: "text-teal-700",
      bg: "bg-teal-50",
      border: "border-teal-200",
      href: "/dashboard/tasks",
    },
  ];

  // Quick access tiles — kiosk-style module navigation
  const quickTiles = [
    { label: "Fund Flow", value: `${activeProjects}`, sub: "active projects", icon: Landmark, href: "/dashboard/fund-flow", color: "text-teal-700 bg-teal-50" },
    { label: "Due Bills", value: `₹${pendingAmount > 99999 ? `${(pendingAmount / 100000).toFixed(1)}L` : pendingAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, sub: "pending", icon: FileText, href: "/dashboard/due-bills", color: "text-teal-700 bg-teal-50" },
    { label: "Work in Progress", value: `${wipCount}`, sub: "records", icon: Hammer, href: "/dashboard/wip", color: "text-teal-700 bg-teal-50" },
    { label: "Contractors", value: `${fundFlowCount}`, sub: "entries", icon: HardHat, href: "/dashboard/contractors", color: "text-teal-700 bg-teal-50" },
    { label: "Tenders", value: `${activeTenders}`, sub: "active", icon: ClipboardList, href: "/dashboard/tenders", color: "text-teal-700 bg-teal-50" },
    { label: "Payment Schedules", value: "", sub: "View schedule", icon: Wallet, href: "/dashboard/payment-schedules", color: "text-teal-700 bg-teal-50" },
    { label: "Vehicle Log Book", value: `${activeVehicles}`, sub: "active", icon: Car, href: "/dashboard/vehicle-log-book", color: "text-teal-700 bg-teal-50" },
    { label: "Assets", value: `${totalAssets}`, sub: "items", icon: Box, href: "/dashboard/assets", color: "text-teal-700 bg-teal-50" },
    { label: "TADA Bills", value: `${pendingTadaClaims}`, sub: "pending", icon: ReceiptText, href: "/dashboard/tada-bills", color: "text-teal-700 bg-teal-50" },
    { label: "Tasks", value: `${openTasks}`, sub: "open", icon: CheckSquare, href: "/dashboard/tasks", color: "text-teal-700 bg-teal-50" },
  ];

  const maxBillAmount = Math.max(...dueBillsByProject.map((b) => Number(b.billAmount)), 1);

  const taskStatusLabels: Record<string, string> = {
    OPEN: "Open",
    IN_PROGRESS: "In Progress",
    PENDING_REVIEW: "Pending Review",
    ON_HOLD: "On Hold",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };
  const taskStatusColors: Record<string, string> = {
    OPEN: "bg-blue-500",
    IN_PROGRESS: "bg-violet-500",
    PENDING_REVIEW: "bg-amber-500",
    ON_HOLD: "bg-zinc-400",
    COMPLETED: "bg-emerald-500",
    CANCELLED: "bg-red-400",
  };
  const totalTasks = taskStatusCounts.reduce((sum, s) => sum + s._count, 0) || 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero header — big, clear, welcoming */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-gradient-to-r from-card to-muted/30 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-1 shadow-sm overflow-hidden">
            <img src="/saes-logo.jpg" alt="SAEC Logo" className="h-full w-full rounded-xl object-cover" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Welcome, {userName.split(" ")[0]}</h1>
            <p className="text-sm text-muted-foreground">{today}</p>
          </div>
        </div>
        <Badge variant="secondary" className="capitalize self-start sm:self-auto">
          {session?.user?.role?.toLowerCase()}
        </Badge>
      </div>

      {/* Financial highlights — 3 big numbers */}
      <div className="grid gap-4 sm:grid-cols-3">
        {financialHighlights.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href}>
              <Card className={`h-full border ${item.border} shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5`}>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.bg}`}>
                      <Icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight">{item.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.sub}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Quick access — kiosk-style module tiles */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Quick Access</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {quickTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link key={tile.label} href={tile.href}>
                <Card className="h-full shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                  <CardContent className="flex flex-col items-center p-4 text-center">
                    <div className={`mb-2 flex h-12 w-12 items-center justify-center rounded-xl ${tile.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{tile.label}</p>
                    {tile.value && (
                      <p className="mt-0.5 text-lg font-bold tracking-tight">{tile.value}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{tile.sub}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* AI Executive Summary — full width */}
      <AiDashboardSummary />

      {/* Charts — financial and task overview */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Financial & Task Overview</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Due Bills by Project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dueBillsByProject.length === 0 && (
                <p className="text-sm text-muted-foreground">No due bills data available.</p>
              )}
              {dueBillsByProject.map((bill) => {
                const amount = Number(bill.billAmount);
                const widthPct = (amount / maxBillAmount) * 100;
                const received = Number(bill.receivedAmount);
                const receivedPct = amount > 0 ? (received / amount) * 100 : 0;
                return (
                  <div key={bill.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-foreground max-w-[200px]">
                        {bill.project.name}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        ₹{amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="relative h-5 overflow-hidden rounded bg-muted">
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-blue-200 dark:bg-blue-900"
                        style={{ width: `${widthPct}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-blue-500"
                        style={{ width: `${(widthPct * receivedPct) / 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {dueBillsByProject.length > 0 && (
                <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded bg-blue-500" />
                    Received
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded bg-blue-200 dark:bg-blue-900" />
                    Pending
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Task Status Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {taskStatusCounts.length === 0 && (
                <p className="text-sm text-muted-foreground">No tasks data available.</p>
              )}
              {taskStatusCounts.length > 0 && (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                    {taskStatusCounts.map((s) => {
                      const pct = (s._count / totalTasks) * 100;
                      return (
                        <div
                          key={s.status}
                          className={taskStatusColors[s.status] ?? "bg-zinc-400"}
                          style={{ width: `${pct}%` }}
                          title={`${taskStatusLabels[s.status] ?? s.status}: ${s._count}`}
                        />
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {taskStatusCounts.map((s) => (
                      <div key={s.status} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-2.5 w-2.5 rounded ${taskStatusColors[s.status] ?? "bg-zinc-400"}`} />
                          <span className="text-muted-foreground">{taskStatusLabels[s.status] ?? s.status}</span>
                        </div>
                        <span className="font-mono font-medium">{s._count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

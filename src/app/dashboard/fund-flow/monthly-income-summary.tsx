"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Minus,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";
import { FundFlowEditor } from "./fund-flow-editor";
import {
  getMonthlyIncomeSummary,
  getMonthlyIncomeBreakdown,
  getMonthlyExpenses,
  getMonthlyPlannedNet,
  getMonthlyRunningBalance,
  getProjectMonthlyReport,
} from "@/lib/actions/fund-flow-monthly";
import type {
  MonthlyReportRow,
  ExpenseSpanWarning,
  MissingExpenseConfig as MissingExpenseConfigEntry,
} from "@/lib/fund-flow-summary";
import { getFundFlowByProjectId, getFundFlows } from "@/lib/actions/fund-flow";
import type { FundFlowWithComputed } from "@/types/fund-flow";

interface IncomeMonth {
  month: number;
  year: number;
  label: string;
  /** confirmed report covers the full Apr 2026 – Mar 2028 window */
  formulaCovered: boolean;
  totalIncome: { toString: () => string } | null;
  projectCount: number;
  unavailableCount: number;
}

interface ExpenseMonth {
  month: number;
  year: number;
  /** derived Row 14 expense ("0" when no project is in-span) */
  amount: { toString: () => string };
  contributors: { projectName: string; staffExp: string }[];
}

interface MissingExpenseConfig {
  projectName: string;
  missing: string[];
}

interface PlannedNetMonth {
  month: number;
  year: number;
  label: string;
  formulaCovered: boolean;
  plannedNet: { toString: () => string } | null;
  incomePresent: boolean;
  expensePresent: boolean;
  excludedCount: number;
  incomplete: boolean;
}

interface RunningBalanceMonth {
  month: number;
  year: number;
  label: string;
  formulaCovered: boolean;
  runningBalance: { toString: () => string } | null;
  gapMonths: number;
  incomplete: boolean;
}

interface BreakdownRow {
  projectId: string;
  projectName: string;
  clientName: string;
  regionName: string;
  income: string;
}

interface Breakdown {
  formulaCovered: boolean;
  rows: BreakdownRow[];
  total: string | null;
  excluded: { projectName: string; reason: string }[];
}

interface ProjectOption {
  id: string;
  name: string;
  clientName: string;
  regionName: string;
}

interface ProjectReportInfo {
  id: string;
  name: string;
  clientName: string;
  regionName: string;
  startMonthLabel: string | null;
  targetTimeLimitMonths: string | null;
  staffExp: string | null;
  totalFee: string | null;
  feeReceived: string | null;
  remainingFee: string | null;
}

interface ProjectReport {
  project: ProjectReportInfo;
  hasFundFlow: boolean;
  months: MonthlyReportRow[];
  missingExpenseConfig: MissingExpenseConfigEntry[];
  expenseSpanWarnings: ExpenseSpanWarning[];
}

/** Display a decimal string at 2 places — display only; stored precision
    stays DECIMAL(23,6). No unit suffix: workbook units are unverified. */
function fmt2(value: unknown): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : String(value);
  if (s === "" || s === "null") return null;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const OVERVIEW_PAGE_SIZE = 6;

export function MonthlyIncomeSummary() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<IncomeMonth[]>([]);
  const [expenses, setExpenses] = useState<ExpenseMonth[]>([]);
  const [planned, setPlanned] = useState<PlannedNetMonth[]>([]);
  const [running, setRunning] = useState<RunningBalanceMonth[]>([]);
  const [missingExpenseConfig, setMissingExpenseConfig] = useState<
    MissingExpenseConfig[]
  >([]);
  const [expenseSpanWarnings, setExpenseSpanWarnings] = useState<
    { projectName: string; targetTimeLimitMonths: string; monthsUsed: number; note: string }[]
  >([]);

  // Selected month — defaults to the first formula-covered month with income,
  // else the first covered month (Apr 2026).
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [monthChosen, setMonthChosen] = useState(false);

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const [overviewPage, setOverviewPage] = useState(0);
  const [editorProject, setEditorProject] = useState<FundFlowWithComputed | null>(null);

  // Project-wise mode
  const [scope, setScope] = useState<"all" | "project">("all");
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projectReport, setProjectReport] = useState<ProjectReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [incomeResult, expenseResult, netResult, balResult] =
        await Promise.all([
          getMonthlyIncomeSummary(),
          getMonthlyExpenses(),
          getMonthlyPlannedNet(),
          getMonthlyRunningBalance(),
        ]);
      if (incomeResult.success && incomeResult.data) {
        setSummary(incomeResult.data);
      }
      if (expenseResult.success && expenseResult.data) {
        const data = expenseResult.data as {
          expenses: ExpenseMonth[];
          missingExpenseConfig?: MissingExpenseConfig[];
          expenseSpanWarnings?: typeof expenseSpanWarnings;
        };
        setExpenses(data.expenses);
        setMissingExpenseConfig(data.missingExpenseConfig ?? []);
        setExpenseSpanWarnings(data.expenseSpanWarnings ?? []);
      }
      if (netResult.success && netResult.data) {
        setPlanned((netResult.data as { months: PlannedNetMonth[] }).months);
      }
      if (balResult.success && balResult.data) {
        setRunning((balResult.data as { months: RunningBalanceMonth[] }).months);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Default selection once data arrives: first covered month that has income.
  useEffect(() => {
    if (monthChosen || summary.length === 0) return;
    const firstWithIncome = summary.findIndex(
      (m) => m.formulaCovered && m.totalIncome != null
    );
    setSelectedIdx(firstWithIncome >= 0 ? firstWithIncome : 0);
    setMonthChosen(true);
  }, [summary, monthChosen]);

  const selMonth = summary[selectedIdx];
  const selExpense = expenses[selectedIdx];
  const selPlanned = planned[selectedIdx];
  const selRunning = running[selectedIdx];

  useEffect(() => {
    if (!showBreakdown || !selMonth) return;
    let cancelled = false;
    setBreakdownLoading(true);
    getMonthlyIncomeBreakdown(selMonth.month, selMonth.year)
      .then((res) => {
        if (!cancelled && res.success && res.data)
          setBreakdown(res.data as Breakdown);
      })
      .finally(() => {
        if (!cancelled) setBreakdownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showBreakdown, selectedIdx, selMonth]);

  // Lazy-load the project list the first time Project Wise is chosen.
  useEffect(() => {
    if (scope !== "project" || projects !== null) return;
    let cancelled = false;
    void getFundFlows(undefined, 1, 500).then((res) => {
      if (cancelled || !res.success || !res.data) return;
      const list = (res.data as { rows: unknown[] }).rows.map((raw) => {
        const r = raw as {
          id: string;
          name: string;
          client?: { name: string };
          region?: { name: string };
        };
        return {
          id: r.id,
          name: r.name,
          clientName: r.client?.name ?? "—",
          regionName: r.region?.name ?? "—",
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setProjects(list);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, projects]);

  useEffect(() => {
    if (scope !== "project" || !projectId) {
      setProjectReport(null);
      return;
    }
    let cancelled = false;
    setReportLoading(true);
    setProjectReport(null);
    getProjectMonthlyReport(projectId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setProjectReport(res.data as ProjectReport);
        } else {
          toast.error(res.error ?? "Could not load the project report.");
        }
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, projectId]);

  const selectedProject = projects?.find((p) => p.id === projectId) ?? null;

  async function openEditor(projectId: string) {
    const res = await getFundFlowByProjectId(projectId);
    if (res.success && res.data) {
      setEditorProject(res.data as FundFlowWithComputed);
    } else {
      toast.error("Could not load the project for editing.");
    }
  }

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Monthly Fund Flow Report
            <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-zinc-500" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded bg-zinc-100" />
        </CardContent>
      </Card>
    );
  }

  const selIncomeText = fmt2(selMonth?.totalIncome);
  const selExpenseText = fmt2(selExpense?.amount);
  const selNetText = fmt2(selPlanned?.plannedNet);
  const selBalText = fmt2(selRunning?.runningBalance);
  const selProvisional =
    selPlanned?.incomplete === true || selRunning?.incomplete === true;

  const overviewPageCount = Math.ceil(summary.length / OVERVIEW_PAGE_SIZE);
  const overviewSlice = summary.slice(
    overviewPage * OVERVIEW_PAGE_SIZE,
    (overviewPage + 1) * OVERVIEW_PAGE_SIZE
  );

  function statusFor(i: number): { label: string; tone: "green" | "amber" | "zinc" } {
    const m = summary[i];
    const e = expenses[i];
    const incomePresent = m?.totalIncome != null;
    const expensePresent =
      (e?.contributors?.length ?? 0) > 0 && e?.amount != null && e.amount !== "0";
    if (!incomePresent && !expensePresent)
      return { label: "No data", tone: "zinc" };
    if (!incomePresent)
      return { label: "No income planned", tone: "zinc" };
    if (missingExpenseConfig.length > 0)
      return { label: "Partial — see notice", tone: "amber" };
    return { label: "Complete", tone: "green" };
  }

  const statusClasses: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    zinc: "bg-zinc-50 text-zinc-500 border-zinc-200",
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base font-medium">
            Monthly Fund Flow Report
          </CardTitle>
          <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-500">
            {scope === "all"
              ? "All projects (combined)"
              : (selectedProject?.name ?? "Single project")}
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          {scope === "all"
            ? "Monthly income, expenses, net and cumulative balance across all projects."
            : "Monthly income, staff expenses, net and cumulative balance for the selected project."}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Info banner */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-blue-50 px-4 py-2.5 text-xs text-blue-800">
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Planned figures only — not actual bank balance.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Expenses are calculated automatically from each project&apos;s Staff
            Exp. across its Start month and Target Time Limit.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Amounts shown in workbook units as entered (2 decimals).
          </span>
        </div>

        {/* Scope toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-zinc-700">Scope</span>
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5">
            {(
              [
                ["all", "Total Income"],
                ["project", "Project Wise"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  scope === value
                    ? "bg-teal-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-zinc-500">
            {scope === "all"
              ? "Combined company figures (Rows 12–18)"
              : "One project's income, staff expenses and running balance"}
          </span>
        </div>

        {/* Month selector */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-zinc-700">Selected Month</span>
          <Select
            value={String(selectedIdx)}
            onValueChange={(v) => setSelectedIdx(Number(v ?? 0))}
          >
            <SelectTrigger className="w-40" size="sm">
              <SelectValue>
                {() => (selMonth ? selMonth.label : "Select month")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {summary.map((m, i) => (
                <SelectItem key={`${m.year}-${m.month}`} value={String(i)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {scope === "project" ? (
          <ProjectWisePanel
            projects={projects}
            selectedProject={selectedProject}
            projectId={projectId}
            setProjectId={setProjectId}
            pickerOpen={pickerOpen}
            setPickerOpen={setPickerOpen}
            report={projectReport}
            reportLoading={reportLoading}
            selMonth={selMonth}
            selectedIdx={selectedIdx}
            onOpenEditor={openEditor}
          />
        ) : (
        <>
        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Planned Income"
            row="Row 12"
            value={selIncomeText}
            icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
            tone="emerald"
            emptyHint="No verified project allocations"
          />
          <SummaryCard
            label="Planned Expenses"
            row="Row 14"
            value={selExpenseText}
            icon={<ArrowDownRight className="h-4 w-4 text-rose-600" />}
            tone="rose"
            emptyHint="No project expenses scheduled"
            caption={
              selExpense?.contributors?.length
                ? `from ${selExpense.contributors.length} project${
                    selExpense.contributors.length === 1 ? "" : "s"
                  }`
                : "calculated automatically"
            }
          />
          <SummaryCard
            label="Planned Net"
            row="Row 16"
            value={selNetText}
            icon={<Minus className="h-4 w-4 text-zinc-500" />}
            tone="zinc"
            provisional={selPlanned?.incomplete}
            provisionalHint="Computed with missing inputs treated as 0"
            emptyHint="No income or expense this month"
          />
          <SummaryCard
            label="Planned Running Balance"
            row="Row 18"
            value={selBalText}
            icon={<Wallet className="h-4 w-4 text-blue-600" />}
            tone="blue"
            provisional={selRunning?.incomplete}
            provisionalHint="Includes months with missing inputs"
            emptyHint="—"
            caption="Plan from an implied zero baseline — not a bank balance"
          />
        </div>
        {selProvisional && (
          <p className="text-xs text-amber-700">
            * Provisional — this month's result uses missing or excluded inputs.
          </p>
        )}

        {/* Project income breakdown */}
        <details
          className="rounded-lg border border-zinc-200"
          onToggle={(e) =>
            setShowBreakdown((e.target as HTMLDetailsElement).open)
          }
        >
          <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            Which Projects Contribute to This Month's Income?
            <span className="ml-auto text-xs font-normal text-zinc-500">
              {selMonth?.label ?? ""} · click to expand
            </span>
          </summary>
          <div className="border-t border-zinc-200 px-4 py-3">
            {breakdownLoading ? (
              <div className="py-4 text-center text-sm text-zinc-500">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : breakdown ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="py-2 pr-3">Project</th>
                        <th className="py-2 pr-3">Client</th>
                        <th className="py-2 pr-3">Region</th>
                        <th className="py-2 pr-3 text-right">Planned income</th>
                        <th className="py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.rows.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-4 text-center text-sm text-zinc-500"
                          >
                            No verified project allocations for this month.
                          </td>
                        </tr>
                      )}
                      {breakdown.rows.map((r) => (
                        <tr key={r.projectId} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium text-zinc-800">
                            {r.projectName}
                          </td>
                          <td className="py-2 pr-3 text-zinc-600">{r.clientName}</td>
                          <td className="py-2 pr-3 text-zinc-600">{r.regionName}</td>
                          <td className="py-2 pr-3 text-right font-mono">
                            {fmt2(r.income)}
                          </td>
                          <td className="py-2 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7"
                              onClick={() => void openEditor(r.projectId)}
                            >
                              View / Edit
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {breakdown.rows.length > 0 && (
                      <tfoot>
                        <tr className="border-t font-medium">
                          <td colSpan={3} className="py-2 text-zinc-700">
                            Total (equals Row 12 for {selMonth?.label})
                          </td>
                          <td className="py-2 text-right font-mono">
                            {fmt2(breakdown.total) ?? "—"}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                {breakdown.excluded.length > 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <p className="font-medium">
                      Excluded — not counted toward Row 12:
                    </p>
                    <ul className="mt-1 list-inside list-disc">
                      {breakdown.excluded.map((e) => (
                        <li key={e.projectName + e.reason}>
                          {e.projectName} — {e.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="py-3 text-sm text-zinc-500">
                Expand to load this month's project allocations.
              </p>
            )}
          </div>
        </details>

        {/* Monthly overview table */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-800">
              Total Income per Month
            </h3>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {overviewSlice.length > 0 && (
                <span>
                  Showing {overviewSlice[0].label} –{" "}
                  {overviewSlice[overviewSlice.length - 1].label}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={overviewPage === 0}
                onClick={() => setOverviewPage((p) => Math.max(0, p - 1))}
                aria-label="Earlier months"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={overviewPage >= overviewPageCount - 1}
                onClick={() =>
                  setOverviewPage((p) => Math.min(overviewPageCount - 1, p + 1))
                }
                aria-label="Later months"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pl-3 pr-3">Month</th>
                  <th className="py-2 pr-3 text-right">Planned Income</th>
                  <th className="py-2 pr-3 text-right">Planned Expenses</th>
                  <th className="py-2 pr-3 text-right">Planned Net</th>
                  <th className="py-2 pr-3 text-right">Running Balance</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {overviewSlice.map((m) => {
                  const i = summary.indexOf(m);
                  const e = expenses[i];
                  const p = planned[i];
                  const r = running[i];
                  const status = statusFor(i);
                  return (
                    <tr key={m.label} className="border-b last:border-0">
                      <td className="py-2 pl-3 pr-3 font-medium text-zinc-800">
                        {m.label}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {fmt2(m.totalIncome) ?? "—"}
                        {m.unavailableCount > 0 && m.totalIncome != null && (
                          <sup
                            className="ml-0.5 text-amber-600"
                            title={`${m.unavailableCount} ambiguous record(s) excluded`}
                          >
                            *
                          </sup>
                        )}
                      </td>
                      <td
                        className="py-2 pr-3 text-right font-mono"
                        title={
                          e?.contributors?.length
                            ? e.contributors
                                .map(
                                  (c) =>
                                    `${c.projectName}: Staff Exp. ${fmt2(c.staffExp)}`
                                )
                                .join("\n")
                            : undefined
                        }
                      >
                        {e != null ? fmt2(e.amount) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {p?.plannedNet != null ? (
                          <>
                            {fmt2(p.plannedNet)}
                            {p.incomplete && (
                              <sup
                                className="ml-0.5 text-amber-600"
                                title="Provisional — missing or excluded inputs treated as 0"
                              >
                                *
                              </sup>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {r?.runningBalance != null ? (
                          <>
                            {fmt2(r.runningBalance)}
                            {r.incomplete && (
                              <sup
                                className="ml-0.5 text-amber-600"
                                title="Provisional — balance carries months with missing inputs"
                              >
                                *
                              </sup>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses[status.tone]}`}
                        >
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* How Row 14 is derived + missing-configuration flag */}
        <div className="rounded-lg border border-zinc-200 px-4 py-3">
          <p className="text-xs text-zinc-500">
            <span className="font-medium text-zinc-700">
              Monthly Expenses (Row 14) are calculated automatically
            </span>{" "}
            — every project contributes its saved Staff Exp. in each month of
            its schedule (Start month through Start month + Target Time Limit −
            1). To change an expense, update the project&apos;s Staff Exp.,
            Start month or Target Time Limit in the Fund Flow form.
          </p>
          {selExpense && selExpense.contributors.length > 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              <span className="font-medium text-zinc-700">
                {selMonth?.label} contributors:
              </span>{" "}
              {selExpense.contributors
                .map((c) => `${c.projectName} (${fmt2(c.staffExp)})`)
                .join(", ")}
            </p>
          )}
          {missingExpenseConfig.length > 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-medium">
                {missingExpenseConfig.length} project
                {missingExpenseConfig.length === 1 ? " is" : "s are"} missing
                timing configuration — excluded from expenses (totals may be
                incomplete):
              </p>
              <ul className="mt-1 list-inside list-disc">
                {missingExpenseConfig.map((m) => (
                  <li key={m.projectName}>
                    {m.projectName} — missing {m.missing.join(" and ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {expenseSpanWarnings.length > 0 && (
            <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <ul className="list-inside list-disc">
                {expenseSpanWarnings.map((w) => (
                  <li key={w.projectName}>
                    {w.projectName} — Target Time Limit{" "}
                    {w.targetTimeLimitMonths} is not a whole number:{" "}
                    {w.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        </>
        )}
      </CardContent>
      {editorProject && (
        <FundFlowEditor
          project={editorProject}
          onClose={() => {
            setEditorProject(null);
            void load();
          }}
        />
      )}
    </Card>
  );
}

function SummaryCard({
  label,
  row,
  value,
  icon,
  tone,
  provisional,
  provisionalHint,
  emptyHint,
  caption,
}: {
  label: string;
  row: string;
  value: string | null;
  icon: React.ReactNode;
  tone: "emerald" | "rose" | "zinc" | "blue";
  provisional?: boolean;
  provisionalHint?: string;
  emptyHint?: string;
  caption?: string;
}) {
  const toneClasses = {
    emerald: "bg-emerald-50 border-emerald-100",
    rose: "bg-rose-50 border-rose-100",
    zinc: "bg-zinc-50 border-zinc-200",
    blue: "bg-blue-50 border-blue-100",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-500">
          {label} <span className="text-zinc-500">({row})</span>
        </p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
        {value != null ? (
          <>
            {value}
            {provisional && (
              <sup
                className="ml-0.5 text-sm text-amber-600"
                title={provisionalHint}
              >
                *
              </sup>
            )}
          </>
        ) : (
          <span className="text-sm font-normal italic text-zinc-500">
            {emptyHint ?? "—"}
          </span>
        )}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {caption ?? "workbook units"}
      </p>
    </div>
  );
}

function ProjectWisePanel({
  projects,
  selectedProject,
  projectId,
  setProjectId,
  pickerOpen,
  setPickerOpen,
  report,
  reportLoading,
  selMonth,
  selectedIdx,
  onOpenEditor,
}: {
  projects: ProjectOption[] | null;
  selectedProject: ProjectOption | null;
  projectId: string | null;
  setProjectId: (id: string) => void;
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
  report: ProjectReport | null;
  reportLoading: boolean;
  selMonth: IncomeMonth | undefined;
  selectedIdx: number;
  onOpenEditor: (projectId: string) => Promise<void> | void;
}) {
  const missingCfg = (report?.missingExpenseConfig.length ?? 0) > 0;
  const monthRow = report?.months[selectedIdx];
  const incomeText = monthRow?.income != null ? fmt2(monthRow.income) : null;
  const hasAmbiguousIncome = (monthRow?.incomeUnavailableCount ?? 0) > 0;
  // An unknown expense span is NOT zero — with missing timing the expense,
  // net and cumulative figures are unknown, not "0.00".
  const expenseText =
    !missingCfg && monthRow ? fmt2(monthRow.expense) : null;
  const netText = !missingCfg && monthRow ? fmt2(monthRow.net) : null;
  const balText =
    !missingCfg && monthRow ? fmt2(monthRow.cumulativeBalance) : null;

  return (
    <div className="space-y-4">
      {/* Project picker — searchable */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-zinc-700">Project</span>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            className="inline-flex h-11 min-w-[16rem] max-w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-base font-normal text-zinc-700 hover:bg-zinc-50"
            aria-label="Choose a project"
          >
            {selectedProject ? (
              <span className="truncate">{selectedProject.name}</span>
            ) : (
              <span className="text-zinc-500">Search projects…</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-[24rem] max-w-[90vw] p-0" align="start">
            <Command>
              <CommandInput placeholder="Type project, client or region…" />
              <CommandList>
                <CommandEmpty>
                  {projects == null ? "Loading…" : "No project found."}
                </CommandEmpty>
                <CommandGroup>
                  {(projects ?? []).map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${p.clientName} ${p.regionName}`}
                      onSelect={() => {
                        setProjectId(p.id);
                        setPickerOpen(false);
                      }}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${
                          projectId === p.id ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-800">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {p.clientName} · {p.regionName}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedProject && (
          <Button
            variant="outline"
            size="sm"
            className="h-11"
            onClick={() => void onOpenEditor(selectedProject.id)}
          >
            View / Edit Project
          </Button>
        )}
      </div>

      {!selectedProject ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
          Choose a project above to see its monthly income, staff expenses and
          running balance.
        </p>
      ) : reportLoading || !report ? (
        <div className="rounded-lg border border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Loading project report…
        </div>
      ) : (
        <>
          {/* Plain-language explanation */}
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              These values show the monthly income and staff expenses of the
              selected project. Cumulative Balance shows the project&apos;s
              running planned balance, not its actual bank balance.
            </span>
          </div>

          {/* Project information */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
            <p className="text-base font-semibold text-zinc-800">
              {report.project.name}
            </p>
            <p className="text-sm text-zinc-500">
              {report.project.clientName} · {report.project.regionName}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              {(
                [
                  ["Start month", report.project.startMonthLabel ?? "Not configured"],
                  [
                    "Target Time Limit (In Month)",
                    report.project.targetTimeLimitMonths ?? "Not configured",
                  ],
                  [
                    "Staff Exp.",
                    fmt2(report.project.staffExp) ?? "Not recorded",
                  ],
                  ["Total Fee", fmt2(report.project.totalFee) ?? "—"],
                  [
                    "remaing fee",
                    fmt2(report.project.remainingFee) ?? "Not recorded",
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-zinc-500">{label}</dt>
                  <dd
                    className={`mt-0.5 text-base font-medium ${
                      value === "Not configured" || value === "Not recorded"
                        ? "italic text-amber-700"
                        : "text-zinc-800"
                    }`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Timing / span warnings */}
          {missingCfg && (
            <div className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              <p className="font-medium">
                This project is missing timing configuration — its monthly
                expense, net and balance cannot be calculated:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {report.missingExpenseConfig.map((mc) => (
                  <li key={mc.projectName}>
                    Missing {mc.missing.join(" and ")} — set them in the Fund
                    Flow form.
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!missingCfg && !report.hasFundFlow && (
            <div className="rounded-lg bg-zinc-50 px-4 py-2.5 text-sm text-zinc-600">
              This project has no fund flow record yet — no Staff Exp. or saved
              allocations exist.
            </div>
          )}
          {report.expenseSpanWarnings.map((w) => (
            <div
              key={w.projectName}
              className="rounded-lg bg-blue-50 px-4 py-2.5 text-sm text-blue-800"
            >
              Target Time Limit {w.targetTimeLimitMonths} is not a whole
              number: {w.note}
            </div>
          ))}

          {/* Project financial cards for the selected month */}
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700">
              {selMonth?.label ?? "Selected month"} —{" "}
              <span className="text-zinc-500">
                {report.project.name} only (not the company-wide Row 12–18
                totals)
              </span>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                label="Monthly Income"
                row="this project"
                value={incomeText}
                icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
                tone="emerald"
                provisional={incomeText != null && hasAmbiguousIncome}
                provisionalHint="An ambiguous record was excluded from this month"
                emptyHint={
                  hasAmbiguousIncome
                    ? "Unverified record — excluded"
                    : "No saved allocation"
                }
                caption="verified saved allocation"
              />
              <SummaryCard
                label="Monthly Expense"
                row="this project"
                value={expenseText}
                icon={<ArrowDownRight className="h-4 w-4 text-rose-600" />}
                tone="rose"
                emptyHint={
                  missingCfg ? "Timing not configured" : "No expense this month"
                }
                caption="Staff Exp. in active months"
              />
              <SummaryCard
                label="Monthly Net"
                row="this project"
                value={netText}
                icon={<Minus className="h-4 w-4 text-zinc-500" />}
                tone="zinc"
                provisional={monthRow?.incomplete === true && !missingCfg}
                provisionalHint="Computed with missing or excluded inputs treated as 0"
                emptyHint={
                  missingCfg
                    ? "Unavailable — timing missing"
                    : "No income or expense this month"
                }
                caption="income − staff expense"
              />
              <SummaryCard
                label="Cumulative Balance"
                row="this project"
                value={balText}
                icon={<Wallet className="h-4 w-4 text-blue-600" />}
                tone="blue"
                provisional={monthRow?.incomplete === true && !missingCfg}
                provisionalHint="Includes months with missing or excluded inputs"
                emptyHint={
                  missingCfg ? "Unavailable — timing missing" : "—"
                }
                caption="Project's running planned balance — not a bank balance"
              />
            </div>
          </div>

          {/* 24-month project table */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-800">
              Month-wise — Apr 2026 to Mar 2028
            </h3>
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <div className="max-h-[26rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="py-2 pl-3 pr-3">Month</th>
                      <th className="py-2 pr-3 text-right">Income</th>
                      <th className="py-2 pr-3 text-right">Staff Expense</th>
                      <th className="py-2 pr-3 text-right">Monthly Net</th>
                      <th className="py-2 pr-3 text-right">
                        Cumulative Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.months.map((row, i) => (
                      <tr
                        key={`${row.year}-${row.month}`}
                        className={`border-b last:border-0 ${
                          i === selectedIdx ? "bg-teal-50/60" : ""
                        }`}
                      >
                        <td className="py-2 pl-3 pr-3 font-medium text-zinc-800">
                          {row.label}
                          {i === selectedIdx && (
                            <span className="ml-2 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                              selected
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {row.income != null ? (
                            fmt2(row.income)
                          ) : row.incomeUnavailableCount > 0 ? (
                            <span
                              className="text-amber-600"
                              title="A saved record exists but lacks verified provenance — excluded, not counted"
                            >
                              Unverified
                            </span>
                          ) : (
                            "—"
                          )}
                          {row.income != null &&
                            row.incomeUnavailableCount > 0 && (
                              <sup
                                className="ml-0.5 text-amber-600"
                                title="An ambiguous record was excluded from this month"
                              >
                                *
                              </sup>
                            )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {missingCfg ? "—" : fmt2(row.expense)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {missingCfg ? (
                            "—"
                          ) : row.net != null ? (
                            <>
                              {fmt2(row.net)}
                              {row.incomplete && (
                                <sup
                                  className="ml-0.5 text-amber-600"
                                  title="Provisional — missing or excluded inputs treated as 0"
                                >
                                  *
                                </sup>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {missingCfg ? (
                            "—"
                          ) : (
                            <>
                              {fmt2(row.cumulativeBalance)}
                              {row.incomplete && (
                                <sup
                                  className="ml-0.5 text-amber-600"
                                  title="Provisional — carries months with missing or excluded inputs"
                                >
                                  *
                                </sup>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Project-specific figures — not the company-wide Excel Row 12–18
              totals. A month outside the project&apos;s schedule contributes
              zero staff expense; a negative balance is a valid planned result.
              {missingCfg &&
                " Timing is not configured for this project, so expense, net and balance cannot be shown."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

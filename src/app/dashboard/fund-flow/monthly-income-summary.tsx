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
  Pencil,
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
  upsertMonthlyExpense,
  getMonthlyPlannedNet,
  getMonthlyRunningBalance,
  getMonthlyAllocations,
} from "@/lib/actions/fund-flow-monthly";
import { getFundFlowByProjectId, getFundFlows } from "@/lib/actions/fund-flow";
import type { FundFlowWithComputed } from "@/types/fund-flow";

interface IncomeMonth {
  month: number;
  year: number;
  label: string;
  /** Excel Row 12 formulas exist only for Apr 2026 – Jun 2027 */
  formulaCovered: boolean;
  totalIncome: { toString: () => string } | null;
  projectCount: number;
  unavailableCount: number;
}

interface ExpenseMonth {
  month: number;
  year: number;
  amount: { toString: () => string } | null;
  updatedAt: string | null;
  unavailable?: boolean;
  unavailableReason?: string;
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

interface ProjectAllocation {
  month: number;
  year: number;
  amount: string | null;
  unavailable?: boolean;
  unavailableReason?: string;
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

function decimalToInputString(value: unknown, maxFrac = 2): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : String(value);
  if (s === "" || s === "null" || s === "undefined") return "";
  if (!s.includes(".")) return `${s}.00`;
  const [intPart, fracPart] = s.split(".");
  if (fracPart.length === 1) return `${intPart}.${fracPart}0`;
  if (fracPart.length > maxFrac) return `${intPart}.${fracPart.slice(0, maxFrac)}`;
  return s;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function monthLabel(month: number, year: number) {
  return `${MONTH_LABELS[month - 1] ?? month} ${year}`;
}

const OVERVIEW_PAGE_SIZE = 6;

export function MonthlyIncomeSummary() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<IncomeMonth[]>([]);
  const [expenses, setExpenses] = useState<ExpenseMonth[]>([]);
  const [planned, setPlanned] = useState<PlannedNetMonth[]>([]);
  const [running, setRunning] = useState<RunningBalanceMonth[]>([]);
  const [saving, setSaving] = useState(false);

  // Selected month — defaults to the first formula-covered month with income,
  // else the first covered month (Apr 2026).
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [monthChosen, setMonthChosen] = useState(false);

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const [editExpenses, setEditExpenses] = useState(false);
  const [overviewPage, setOverviewPage] = useState(0);
  const [editorProject, setEditorProject] = useState<FundFlowWithComputed | null>(null);

  // Project-wise mode
  const [scope, setScope] = useState<"all" | "project">("all");
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allocations, setAllocations] = useState<ProjectAllocation[] | null>(null);
  const [allocTotal, setAllocTotal] = useState<string | null>(null);
  const [allocLoading, setAllocLoading] = useState(false);

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
        const data = expenseResult.data as { expenses: ExpenseMonth[] };
        setExpenses(data.expenses);
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
      setAllocations(null);
      return;
    }
    let cancelled = false;
    setAllocLoading(true);
    getMonthlyAllocations(projectId)
      .then((res) => {
        if (cancelled || !res.success || !res.data) return;
        const d = res.data as {
          allocations: ProjectAllocation[];
          total: string | null;
        };
        setAllocations(d.allocations);
        setAllocTotal(d.total);
      })
      .finally(() => {
        if (!cancelled) setAllocLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, projectId]);

  const selectedProject = projects?.find((p) => p.id === projectId) ?? null;
  const selProjectAlloc = allocations?.[selectedIdx] ?? null;
  const [allocView, setAllocView] = useState<"entered" | "all">("entered");
  const [allocPage, setAllocPage] = useState(0);
  useEffect(() => {
    setAllocPage(0);
  }, [projectId, allocView]);

  async function openEditor(projectId: string) {
    const res = await getFundFlowByProjectId(projectId);
    if (res.success && res.data) {
      setEditorProject(res.data as FundFlowWithComputed);
    } else {
      toast.error("Could not load the project for editing.");
    }
  }

  async function saveExpense(
    month: number,
    year: number,
    value: string,
    expectedUpdatedAt: string | null
  ) {
    const trimmed = value.trim();
    // Blank input is a no-op: never delete or overwrite existing data.
    if (trimmed === "") {
      await load();
      return;
    }
    setSaving(true);
    try {
      const result = await upsertMonthlyExpense({
        month,
        year,
        amount: trimmed,
        expectedUpdatedAt: expectedUpdatedAt ?? undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to save monthly expense.");
        await load();
        return;
      }
      toast.success("Monthly expense saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unexpected error.");
      await load();
    } finally {
      setSaving(false);
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
  const selExpenseEntered = selExpense?.amount != null && !selExpense.unavailable;
  const selExpenseText = selExpenseEntered ? fmt2(selExpense.amount) : null;
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
    if (m && !m.formulaCovered)
      return { label: "Outside formula range", tone: "zinc" };
    if (e?.unavailable) return { label: "Expense unverified", tone: "amber" };
    const incomePresent = m?.totalIncome != null;
    const expensePresent = e?.amount != null;
    if (!incomePresent && !expensePresent)
      return { label: "No data", tone: "zinc" };
    if (!expensePresent)
      return { label: "Missing expense", tone: "amber" };
    if (!incomePresent)
      return { label: "No income planned", tone: "zinc" };
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
            All projects (combined)
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          This report summarizes Rows 12–18 across all listed projects.
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
            Blank expense is different from zero.
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
              : "One project's saved monthly income plan"}
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
            allocations={allocations}
            allocTotal={allocTotal}
            allocLoading={allocLoading}
            selMonth={selMonth}
            selProjectAlloc={selProjectAlloc}
            allocView={allocView}
            setAllocView={setAllocView}
            allocPage={allocPage}
            setAllocPage={setAllocPage}
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
            emptyHint={
              selExpense?.unavailable
                ? "Unverified record — not editable"
                : "Expense not entered"
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
            emptyHint="Outside formula range"
          />
          <SummaryCard
            label="Planned Running Balance"
            row="Row 18"
            value={selBalText}
            icon={<Wallet className="h-4 w-4 text-blue-600" />}
            tone="blue"
            provisional={selRunning?.incomplete}
            provisionalHint="Includes months with missing inputs"
            emptyHint="Outside formula range"
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
                {!breakdown.formulaCovered && (
                  <p className="mb-2 text-xs text-amber-700">
                    This month is outside the workbook Row 12 formula range —
                    allocations listed below are not added to Row 12.
                  </p>
                )}
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
                      <td className="py-2 pr-3 text-right font-mono">
                        {e?.unavailable ? (
                          <span className="text-amber-600" title={e.unavailableReason}>
                            Unverified
                          </span>
                        ) : e?.amount != null ? (
                          fmt2(e.amount)
                        ) : (
                          <span className="italic text-zinc-500">Not entered</span>
                        )}
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
                        ) : p?.formulaCovered ? (
                          <span className="italic text-zinc-500">Incomplete</span>
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
                        ) : r?.formulaCovered ? (
                          <span className="italic text-zinc-500">Incomplete</span>
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

        {/* Expense editing */}
        <div className="rounded-lg border border-zinc-200">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => setEditExpenses((v) => !v)}
            aria-expanded={editExpenses}
          >
            <Pencil className="h-4 w-4 text-zinc-500" />
            Edit Monthly Expenses (Row 14)
            <span className="ml-auto text-xs font-normal text-zinc-500">
              {editExpenses ? "Hide" : "Show"}
            </span>
          </button>
          {editExpenses && (
            <div className="border-t border-zinc-200 px-4 py-3">
              <p className="mb-3 text-xs text-zinc-500">
                Company monthly expense plan — enter one amount per month.
                Leave blank for unentered; enter 0 for an explicit zero.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {expenses.map((e) => (
                  <div key={`${e.year}-${e.month}`} className="space-y-1">
                    <label className="block text-xs text-zinc-500">
                      {monthLabel(e.month, e.year)}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      defaultValue={decimalToInputString(e.amount, 2)}
                      disabled={e.unavailable === true || saving}
                      placeholder="—"
                      title={
                        e.unavailable
                          ? e.unavailableReason ?? "Unavailable for editing"
                          : "Manually entered monthly expense"
                      }
                      className="h-8 w-full rounded border border-zinc-200 bg-white px-2 text-right font-mono text-sm text-zinc-700 disabled:bg-zinc-50 disabled:text-zinc-500 focus:border-zinc-400 focus:outline-none"
                      onBlur={(ev) => {
                        const v = ev.target.value.trim();
                        if (v === decimalToInputString(e.amount, 2)) return;
                        void saveExpense(e.month, e.year, v, e.updatedAt);
                      }}
                    />
                  </div>
                ))}
              </div>
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
  allocations,
  allocTotal,
  allocLoading,
  selMonth,
  selProjectAlloc,
  allocView,
  setAllocView,
  allocPage,
  setAllocPage,
  onOpenEditor,
}: {
  projects: ProjectOption[] | null;
  selectedProject: ProjectOption | null;
  projectId: string | null;
  setProjectId: (id: string) => void;
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
  allocations: ProjectAllocation[] | null;
  allocTotal: string | null;
  allocLoading: boolean;
  selMonth: IncomeMonth | undefined;
  selProjectAlloc: ProjectAllocation | null;
  allocView: "entered" | "all";
  setAllocView: (v: "entered" | "all") => void;
  allocPage: number;
  setAllocPage: (fn: (p: number) => number) => void;
  onOpenEditor: (projectId: string) => Promise<void> | void;
}) {
  return (
    <div className="space-y-4">
      {/* Project picker */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-zinc-700">Project</span>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger className="inline-flex h-9 min-w-[16rem] items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-700 hover:bg-zinc-50">
            {selectedProject ? (
              <span className="truncate">{selectedProject.name}</span>
            ) : (
              <span className="text-zinc-500">Search projects…</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-[24rem] p-0" align="start">
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
            onClick={() => void onOpenEditor(selectedProject.id)}
          >
            View / Edit Project
          </Button>
        )}
      </div>

      {!selectedProject ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
          Choose a project above to see its saved monthly income plan.
        </p>
      ) : (
        <>
          {/* Selected project header + compact summary */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-800">
              {selectedProject.name}
            </p>
            <p className="text-xs text-zinc-500">
              {selectedProject.clientName} · {selectedProject.regionName}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xs text-zinc-500">
                Planned income in {selMonth?.label ?? "selected month"}:
              </span>
              <span className="text-xl font-semibold text-zinc-900">
                {selProjectAlloc?.amount != null
                  ? fmt2(selProjectAlloc.amount)
                  : selProjectAlloc?.unavailable
                    ? "Unverified"
                    : "Not entered"}
              </span>
            </div>
            {allocations && (
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-600">
                <span>
                  Total entered planned income:{" "}
                  <span className="font-mono font-medium text-zinc-800">
                    {fmt2(allocTotal) ?? "—"}
                  </span>
                </span>
                <span>
                  Entered months:{" "}
                  <span className="font-medium text-zinc-800">
                    {
                      allocations.filter(
                        (a) => a.amount != null || a.unavailable
                      ).length
                    }
                  </span>
                </span>
                <span>
                  Blank months:{" "}
                  <span className="font-medium text-zinc-800">
                    {
                      allocations.filter(
                        (a) => a.amount == null && !a.unavailable
                      ).length
                    }
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* View toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-zinc-200 p-0.5">
              {(
                [
                  ["entered", "Entered Months"],
                  ["all", "All 24 Months"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAllocView(value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    allocView === value
                      ? "bg-teal-600 text-white"
                      : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Paginated allocation schedule (6 rows per page) */}
          <AllocMonthsTable
            allocations={allocations}
            allocLoading={allocLoading}
            view={allocView}
            page={allocPage}
            setPage={setAllocPage}
          />
          <p className="text-xs text-zinc-500">
            Project-wise view shows income allocations only. Expenses, net and
            running balance are company-level workbook figures — not per project.
            Allocations after June 2027 remain project data but are not counted
            in the company Row 12 total.
          </p>
        </>
      )}
    </div>
  );
}

const ALLOC_PAGE_SIZE = 6;

function AllocMonthsTable({
  allocations,
  allocLoading,
  view,
  page,
  setPage,
}: {
  allocations: ProjectAllocation[] | null;
  allocLoading: boolean;
  view: "entered" | "all";
  page: number;
  setPage: (fn: (p: number) => number) => void;
}) {
  const rows =
    view === "entered"
      ? (allocations ?? []).filter(
          (a) => a.amount != null || a.unavailable === true
        )
      : (allocations ?? []);
  const pageCount = Math.max(1, Math.ceil(rows.length / ALLOC_PAGE_SIZE));
  const pageRows = rows.slice(
    page * ALLOC_PAGE_SIZE,
    (page + 1) * ALLOC_PAGE_SIZE
  );
  const firstIdx = page * ALLOC_PAGE_SIZE;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pl-3 pr-3">Month</th>
              <th className="py-2 pr-3 text-right">Planned Income</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {allocLoading && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-sm text-zinc-500">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading allocation schedule…
                </td>
              </tr>
            )}
            {!allocLoading && pageRows.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-sm text-zinc-500">
                  {view === "entered"
                    ? "No entered months yet — switch to All 24 Months to plan."
                    : "No allocation data."}
                </td>
              </tr>
            )}
            {!allocLoading &&
              pageRows.map((a) => (
                <tr key={`${a.year}-${a.month}`} className="border-b last:border-0">
                  <td className="py-1.5 pl-3 pr-3 font-medium text-zinc-800">
                    {monthLabel(a.month, a.year)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {a.unavailable ? (
                      <span
                        className="text-amber-600"
                        title={a.unavailableReason}
                      >
                        Unverified
                      </span>
                    ) : a.amount != null ? (
                      fmt2(a.amount)
                    ) : (
                      <span className="italic text-zinc-500">Not entered</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-zinc-500">
                    {a.unavailable
                      ? "Record without workbook provenance"
                      : a.amount == null
                        ? "Blank"
                        : Number(a.amount) === 0
                          ? "Entered as zero"
                          : "Planned"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {rows.length > ALLOC_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500">
            Showing {firstIdx + 1}–{firstIdx + pageRows.length} of{" "}
            {rows.length} months
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {rows.length > 0 && rows.length <= ALLOC_PAGE_SIZE && !allocLoading && (
        <p className="text-xs text-zinc-500">
          Showing all {rows.length} {view === "entered" ? "entered" : ""} months
        </p>
      )}
    </div>
  );
}

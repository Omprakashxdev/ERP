"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMonthlyIncomeSummary,
  getMonthlyExpenses,
  upsertMonthlyExpense,
  getMonthlyPlannedNet,
} from "@/lib/actions/fund-flow-monthly";

interface IncomeMonth {
  month: number;
  year: number;
  label: string;
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
  plannedNet: { toString: () => string } | null;
  incomePresent: boolean;
  expensePresent: boolean;
  excludedCount: number;
  incomplete: boolean;
}

/** Convert a Decimal-like value to an input-safe string without Number() precision loss. */
function decimalToInputString(value: unknown): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : String(value);
  if (s === "" || s === "null" || s === "undefined") return "";
  if (!s.includes(".")) return `${s}.00`;
  const [intPart, fracPart] = s.split(".");
  if (fracPart.length === 1) return `${intPart}.${fracPart}0`;
  if (fracPart.length > 2) return `${intPart}.${fracPart.slice(0, 2)}`;
  return s;
}

export function MonthlyIncomeSummary() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<IncomeMonth[]>([]);
  const [expenses, setExpenses] = useState<ExpenseMonth[]>([]);
  const [expenseTotal, setExpenseTotal] = useState<string | null>(null);
  const [planned, setPlanned] = useState<PlannedNetMonth[]>([]);
  const [plannedTotal, setPlannedTotal] = useState<string | null>(null);
  const [plannedIncomplete, setPlannedIncomplete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [incomeResult, expenseResult, netResult] = await Promise.all([
        getMonthlyIncomeSummary(),
        getMonthlyExpenses(),
        getMonthlyPlannedNet(),
      ]);
      if (incomeResult.success && incomeResult.data) {
        setSummary(incomeResult.data);
      }
      if (expenseResult.success && expenseResult.data) {
        const data = expenseResult.data as {
          expenses: ExpenseMonth[];
          total: { toString: () => string } | null;
        };
        setExpenses(data.expenses);
        setExpenseTotal(decimalToInputString(data.total) || null);
      }
      if (netResult.success && netResult.data) {
        const data = netResult.data as {
          months: PlannedNetMonth[];
          totalNet: { toString: () => string } | null;
          totalIncomplete: boolean;
        };
        setPlanned(data.months);
        setPlannedTotal(decimalToInputString(data.totalNet) || null);
        setPlannedIncomplete(data.totalIncomplete);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
          <CardTitle className="text-sm font-medium">
            Monthly Income, Expense &amp; Planned Net (Rows 12, 14 &amp; 16)
            <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-zinc-400" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-12 animate-pulse bg-zinc-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  const grandTotal = summary.reduce((acc, m) => {
    if (m.totalIncome == null) return acc;
    return acc + Number(m.totalIncome.toString());
  }, 0);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Monthly Income, Expense &amp; Planned Net (Rows 12, 14 &amp; 16)
        </CardTitle>
        <p className="text-xs text-zinc-500">
          Income: verified workbook allocations summed across projects. Expenses:
          worksheet-level manually entered monthly plan (units as entered — not
          assumed). Planned Net = income − expenses; a plan figure, not verified
          cash flow or bank balance. Blank = unentered, distinct from zero.{" "}
          <span className="text-amber-600">*</span> marks months where inputs are
          missing or ambiguous records were excluded — not fully reconciled.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[repeat(25,minmax(72px,1fr))] gap-1 text-xs">
            {/* Header row */}
            {summary.map(({ label }) => (
              <div key={label} className="text-center text-zinc-500">
                {label}
              </div>
            ))}
            <div className="text-center font-medium text-zinc-700">Total</div>

            {/* Row 12 — Income (display only) */}
            <div className="col-span-full text-[10px] uppercase tracking-wide text-zinc-400 mt-1">
              Total Income per Month (Row 12)
            </div>
            {summary.map(({ label, totalIncome, projectCount, unavailableCount }) => (
              <div
                key={label}
                className="h-8 flex items-center justify-end px-1 font-mono text-zinc-700"
                title={
                  unavailableCount > 0
                    ? `Incomplete: ${projectCount} projects with valid allocations, ${unavailableCount} ambiguous record(s) excluded — total is not a fully reconciled workbook figure`
                    : projectCount > 0
                    ? `${projectCount} projects`
                    : "No allocations"
                }
              >
                {totalIncome != null
                  ? `₹${Number(totalIncome.toString()).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "—"}
                {unavailableCount > 0 && (
                  <sup className="ml-0.5 text-amber-600" aria-label="incomplete">*</sup>
                )}
              </div>
            ))}
            <div className="flex h-8 items-center justify-end px-1 font-mono font-medium text-zinc-700">
              {grandTotal > 0
                ? `₹${grandTotal.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : "—"}
            </div>

            {/* Row 14 — Monthly Expenses (manually entered, worksheet-level) */}
            <div className="col-span-full text-[10px] uppercase tracking-wide text-zinc-400 mt-1">
              Monthly Expenses (Row 14 — manual entry)
            </div>
            {expenses.map((e) => {
              const labelKey = `${e.year}-${e.month}`;
              return (
                <div
                  key={labelKey}
                  className="h-8 flex items-center justify-end px-1"
                  title={
                    e.unavailable
                      ? e.unavailableReason ?? "Unavailable for editing"
                      : "Manually entered monthly expense"
                  }
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    defaultValue={decimalToInputString(e.amount)}
                    disabled={e.unavailable === true || saving}
                    placeholder="—"
                    className="h-7 w-full rounded border border-zinc-200 bg-white px-1 text-right font-mono text-zinc-700 disabled:bg-zinc-50 disabled:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                    onBlur={(ev) => {
                      const v = ev.target.value.trim();
                      if (v === decimalToInputString(e.amount)) return;
                      void saveExpense(e.month, e.year, v, e.updatedAt);
                    }}
                  />
                </div>
              );
            })}
            <div
              className="flex h-8 items-center justify-end px-1 font-mono font-medium text-zinc-700"
              title="Sum of entered monthly expense values (Excel AU14 parity)"
            >
              {expenseTotal ?? "—"}
            </div>

            {/* Row 16 — Planned Net = income − expense (computed, display only) */}
            <div className="col-span-full text-[10px] uppercase tracking-wide text-zinc-400 mt-1">
              Planned Net (Row 16 = Row 12 − Row 14)
            </div>
            {planned.map((p) => {
              const reasons: string[] = [];
              if (!p.incomePresent) reasons.push("income missing — treated as 0");
              if (!p.expensePresent) reasons.push("expense missing — treated as 0");
              if (p.excludedCount > 0)
                reasons.push(`${p.excludedCount} ambiguous record(s) excluded`);
              return (
                <div
                  key={`${p.year}-${p.month}`}
                  className="h-8 flex items-center justify-end px-1 font-mono text-zinc-700"
                  title={
                    reasons.length > 0
                      ? `Incomplete: ${reasons.join("; ")}`
                      : "Planned net = monthly income − monthly expense"
                  }
                >
                  {p.plannedNet != null ? decimalToInputString(p.plannedNet) : "—"}
                  {p.incomplete && p.plannedNet != null && (
                    <sup className="ml-0.5 text-amber-600" aria-label="incomplete">*</sup>
                  )}
                </div>
              );
            })}
            <div
              className="flex h-8 items-center justify-end px-1 font-mono font-medium text-zinc-700"
              title={
                plannedIncomplete
                  ? "Incomplete: computed treating missing or excluded inputs as 0 (Excel AU16 = AU12 − AU14 parity)"
                  : "Total income − total expenses (Excel AU16 = AU12 − AU14 parity)"
              }
            >
              {plannedTotal ?? "—"}
              {plannedIncomplete && plannedTotal != null && (
                <sup className="ml-0.5 text-amber-600" aria-label="incomplete">*</sup>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

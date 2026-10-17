"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { upsertFundFlow, getFundFlowByProjectId } from "@/lib/actions/fund-flow";
import {
  getMonthlyAllocations,
  upsertMonthlyAllocation,
  previewMonthlyPlan,
  applyMonthlyPlan,
  MonthlyPlanPreview,
  PlanBasis,
} from "@/lib/actions/fund-flow-monthly";
import { MONTHLY_ALLOCATION_WINDOW } from "@/lib/fund-flow-window";
import { FundFlowWithComputed } from "@/types/fund-flow";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface FundFlowFormProps {
  project: FundFlowWithComputed;
  onClose: () => void;
  /** Render content without the Dialog wrapper (embedded inside a parent dialog). */
  embedded?: boolean;
}

function toMoneyString(value: unknown): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function formatMoney(value: unknown): string {
  if (value == null) return "Unavailable";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Unavailable";
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Convert a Decimal-like value to an input-safe string without Number() precision loss.
    maxFrac defaults to 6 to preserve DECIMAL(23,6) fee/allocation precision. */
function decimalToInputString(value: unknown, maxFrac = 6): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : String(value);
  if (s === "" || s === "null" || s === "undefined") return "";
  if (!s.includes(".")) return `${s}.00`;
  const [intPart, fracPart] = s.split(".");
  if (fracPart.length === 1) return `${intPart}.${fracPart}0`;
  if (fracPart.length > maxFrac) return `${intPart}.${fracPart.slice(0, maxFrac)}`;
  return s;
}

/** Subtract two non-negative decimal strings, string-arithmetic only. */
function subtractDecimals(a: string, b: string): string {
  const parse = (v: string) => {
    const s = /^-?\d+(\.\d+)?$/.test(v) ? v : "0";
    const neg = s.startsWith("-");
    const [i, f = ""] = (neg ? s.slice(1) : s).split(".");
    return { neg, i, f };
  };
  const pa = parse(a);
  const pb = parse(b);
  const fracLen = Math.max(pa.f.length, pb.f.length);
  const ten = BigInt(10);
  const fracMask = ten ** BigInt(fracLen);
  const ai = BigInt(pa.i) * fracMask + BigInt(pa.f.padEnd(fracLen, "0") || "0");
  const bi = BigInt(pb.i) * fracMask + BigInt(pb.f.padEnd(fracLen, "0") || "0");
  const diff = (pa.neg ? -ai : ai) - (pb.neg ? -bi : bi);
  const negOut = diff < BigInt(0);
  const abs = negOut ? -diff : diff;
  const intPart = (abs / fracMask).toString();
  const fracPart = (abs % fracMask).toString().padStart(fracLen, "0");
  return `${negOut ? "-" : ""}${intPart}${fracLen > 0 ? "." + fracPart : ""}`;
}

/** Add two non-negative decimal strings, string-arithmetic only. */
function addDecimals(a: string, b: string): string {
  const parse = (v: string) => {
    const s = /^\d+(\.\d+)?$/.test(v) ? v : "0";
    const [i, f = ""] = s.split(".");
    return { i, f };
  };
  const pa = parse(a);
  const pb = parse(b);
  const fracLen = Math.max(pa.f.length, pb.f.length);
  const fracMask = BigInt(10) ** BigInt(fracLen);
  const ai = BigInt(pa.i) * fracMask + BigInt(pa.f.padEnd(fracLen, "0") || "0");
  const bi = BigInt(pb.i) * fracMask + BigInt(pb.f.padEnd(fracLen, "0") || "0");
  const sum = ai + bi;
  const intPart = (sum / fracMask).toString();
  const fracPart = (sum % fracMask).toString().padStart(fracLen, "0");
  return fracLen > 0 ? `${intPart}.${fracPart}` : intPart;
}

/** Format a decimal-string as Indian-locale currency without Number() precision loss.
    Preserves up to 6 fractional digits (DECIMAL(23,6) allocation values). */
function formatDecimalAsCurrency(value: unknown): string {
  if (value == null || value === "") return "—";
  const s = typeof value === "string" ? value : String(value);
  if (s === "" || s === "null" || s === "undefined") return "—";
  const negative = s.startsWith("-");
  const absS = negative ? s.slice(1) : s;
  const [intStr, fracStr = "00"] = absS.split(".");
  const frac = fracStr.length <= 2 ? (fracStr + "00").slice(0, 2) : fracStr.slice(0, 6);
  const digits = intStr.replace(/^0+/, "") || "0";
  if (digits.length <= 3) {
    return `${negative ? "-" : ""}₹${digits}.${frac}`;
  }
  const lastThree = digits.slice(-3);
  const remaining = digits.slice(0, -3);
  const restWithCommas = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₹${restWithCommas},${lastThree}.${frac}`;
}

export function FundFlowForm({ project, onClose, embedded }: FundFlowFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    miscExp: toMoneyString(project.fundFlow?.miscExp),
    staffExp: toMoneyString(project.fundFlow?.staffExp),
    totalProjectCost: toMoneyString(
      project.fundFlow?.totalProjectCost ?? project.estimatedCost
    ),
    completedWorkAmt: toMoneyString(project.fundFlow?.completedWorkAmt),
    proposedDueBillAmount: toMoneyString(
      project.fundFlow?.proposedDueBillAmount
    ),
    feeReceived: toMoneyString(project.fundFlow?.feeReceived),
  });
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);

  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyAllocations, setMonthlyAllocations] = useState<
    Record<string, string>
  >({});
  const [monthlyUnavailable, setMonthlyUnavailable] = useState<
    Record<string, { reason: string }>
  >({});
  const [monthlyTotal, setMonthlyTotal] = useState<string | null>(null);
  const [monthlySaving, setMonthlySaving] = useState(false);

  // Monthly income plan (Phase 1) state
  const [planBasis, setPlanBasis] = useState<PlanBasis>("TOTAL_FEE");
  const [planInstallments, setPlanInstallments] = useState("18");
  const [planStart, setPlanStart] = useState(
    `${MONTHLY_ALLOCATION_WINDOW[0].year}-${MONTHLY_ALLOCATION_WINDOW[0].month}`
  );
  const [planPreview, setPlanPreview] = useState<MonthlyPlanPreview | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  /** Months the user chose to replace — key "YYYY-M" -> true = replace. */
  const [planReplace, setPlanReplace] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDetailLoading(true);
      try {
        const result = await getFundFlowByProjectId(project.id);
        if (!cancelled && result.success && result.data) {
          setDetailData(result.data as Record<string, unknown>);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setMonthlyLoading(true);
      try {
        const result = await getMonthlyAllocations(project.id);
        if (!cancelled && result.success && result.data) {
          const data = result.data as {
            allocations: {
              month: number;
              year: number;
              amount: { toString: () => string } | null;
              unavailable?: boolean;
              unavailableReason?: string;
            }[];
            total: { toString: () => string } | null;
          };
          const map: Record<string, string> = {};
          const unavailableMap: Record<string, { reason: string }> = {};
          for (const a of data.allocations) {
            const key = `${a.year}-${String(a.month).padStart(2, "0")}`;
            if (a.unavailable) {
              unavailableMap[key] = {
                reason: a.unavailableReason ?? "Unavailable for editing",
              };
            } else {
              map[key] = decimalToInputString(a.amount);
            }
          }
          setMonthlyAllocations(map);
          setMonthlyUnavailable(unavailableMap);
          setMonthlyTotal(
            data.total != null ? decimalToInputString(data.total) : null
          );
        }
      } finally {
        if (!cancelled) setMonthlyLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const remainingWorkAmt = useMemo(() => {
    const total = Number(form.totalProjectCost) || 0;
    const completed = Number(form.completedWorkAmt) || 0;
    return total - completed;
  }, [form.totalProjectCost, form.completedWorkAmt]);

  const remainingFee = useMemo(() => {
    // String-based decimal subtraction — totalFee is DECIMAL(23,6);
    // Number() loses precision beyond 15 significant digits.
    const total = String(project.totalFee ?? "0");
    const rawReceived = form.feeReceived.trim() || "0";
    const received = /^-?\d+(\.\d+)?$/.test(rawReceived) ? rawReceived : "0";
    return subtractDecimals(total, received);
  }, [project.totalFee, form.feeReceived]);

  function updateField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function loadMonthlyAllocations() {
    setMonthlyLoading(true);
    try {
      const result = await getMonthlyAllocations(project.id);
      if (result.success && result.data) {
        const data = result.data as {
          allocations: {
            month: number;
            year: number;
            amount: { toString: () => string } | null;
            unavailable?: boolean;
            unavailableReason?: string;
          }[];
          total: { toString: () => string } | null;
        };
        const map: Record<string, string> = {};
        const unavailableMap: Record<string, { reason: string }> = {};
        for (const a of data.allocations) {
          const key = `${a.year}-${String(a.month).padStart(2, "0")}`;
          if (a.unavailable) {
            unavailableMap[key] = {
              reason: a.unavailableReason ?? "Unavailable for editing",
            };
          } else {
            map[key] = decimalToInputString(a.amount);
          }
        }
        setMonthlyAllocations(map);
        setMonthlyUnavailable(unavailableMap);
        setMonthlyTotal(
          data.total != null ? decimalToInputString(data.total) : null
        );
      }
    } finally {
      setMonthlyLoading(false);
    }
  }

  function planInput() {
    const [startYear, startMonth] = planStart.split("-").map(Number);
    return {
      projectId: project.id,
      basis: planBasis,
      installments: Math.max(1, Math.min(24, Number(planInstallments) || 1)),
      startMonth,
      startYear,
      replace: Object.keys(planReplace).filter((k) => planReplace[k]),
    };
  }

  async function handlePreviewPlan() {
    setPlanLoading(true);
    setPlanPreview(null);
    setPlanReplace({});
    setError("");
    try {
      const result = await previewMonthlyPlan(planInput());
      if (!result.success) {
        setError(result.error ?? "Could not prepare the plan.");
        return;
      }
      setPlanPreview(result.data ?? null);
      // Default every conflict to "keep" — replacement is opt-in only.
      setPlanReplace({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare the plan.");
    } finally {
      setPlanLoading(false);
    }
  }

  /** Resulting total for the planned months after the user's keep/replace choices. */
  function planResultTotal(): string | null {
    if (!planPreview) return null;
    let total = "0";
    for (const item of planPreview.items) {
      const key = `${item.year}-${item.month}`;
      let v: string | null = null;
      if (item.status === "create") v = item.plannedAmount;
      else if (item.status === "keep" || (item.status === "conflict" && !planReplace[key]))
        v = item.existingAmount;
      else if (item.status === "conflict" && planReplace[key]) v = item.plannedAmount;
      if (v != null) total = addDecimals(total, v);
    }
    return total;
  }

  async function handleConfirmPlan() {
    setPlanSaving(true);
    setError("");
    try {
      const result = await applyMonthlyPlan(planInput());
      if (!result.success) {
        setError(result.error ?? "Could not save the plan.");
        toast.error(result.error ?? "Could not save the plan.");
        return;
      }
      const created = result.data?.created ?? 0;
      const replaced = result.data?.replaced ?? 0;
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} month${created === 1 ? "" : "s"} filled in`);
      if (replaced > 0) parts.push(`${replaced} replaced with the calculated amount`);
      toast.success(`Monthly plan saved — ${parts.join(", ") || "no changes"}.`);
      setPlanPreview(null);
      setPlanReplace({});
      await loadMonthlyAllocations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save the plan.";
      setError(msg);
      toast.error(msg);
    } finally {
      setPlanSaving(false);
    }
  }

  async function saveMonthlyAllocation(month: number, year: number, value: string) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const trimmed = value.trim();

    // Blank input is a no-op: do not delete or overwrite existing data.
    if (trimmed === "") {
      await loadMonthlyAllocations();
      return;
    }

    setMonthlySaving(true);
    try {
      const result = await upsertMonthlyAllocation({
        projectId: project.id,
        month,
        year,
        amount: trimmed,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to save monthly allocation.");
        // Restore committed state
        await loadMonthlyAllocations();
        return;
      }
      toast.success("Monthly allocation saved");
      await loadMonthlyAllocations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error.";
      toast.error(msg);
      await loadMonthlyAllocations();
    } finally {
      setMonthlySaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        projectId: project.id,
        miscExp: Number(form.miscExp) || 0,
        staffExp: Number(form.staffExp) || 0,
        totalProjectCost: Number(form.totalProjectCost) || 0,
        completedWorkAmt: Number(form.completedWorkAmt) || 0,
        proposedDueBillAmount: Number(form.proposedDueBillAmount) || 0,
        feeReceived: Number(form.feeReceived) || 0,
      };

      const result = await upsertFundFlow(
        payload as unknown as Parameters<typeof upsertFundFlow>[0]
      );

      if (!result.success) {
        setError(result.error ?? "Failed to save fund flow.");
        toast.error(result.error ?? "Failed to save fund flow.");
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
      return;
    } finally {
      setSubmitting(false);
    }

    toast.success("Fund flow saved successfully");
    router.refresh();
    onClose();
  }

  const reconciliationAvailable = detailData?.reconciliationAvailable === true;

  const body = (
    <>
      {!embedded && (
        <DialogHeader className="border-b px-4 pb-3 pt-4">
          <DialogTitle>Edit fund flow</DialogTitle>
          <DialogDescription>
            Update financial numbers for {project.name}.
          </DialogDescription>
        </DialogHeader>
      )}

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Workbook figures</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="miscExp">Misc exp (₹)</Label>
              <Input
                id="miscExp"
                type="number"
                step="0.01"
                value={form.miscExp}
                onChange={(e) => updateField("miscExp", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staffExp">Staff exp (₹)</Label>
              <Input
                id="staffExp"
                type="number"
                step="0.01"
                value={form.staffExp}
                onChange={(e) => updateField("staffExp", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="totalProjectCost">Total project cost (₹)</Label>
              <Input
                id="totalProjectCost"
                type="number"
                step="0.01"
                value={form.totalProjectCost}
                onChange={(e) => updateField("totalProjectCost", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="completedWorkAmt">Completed work (₹)</Label>
              <Input
                id="completedWorkAmt"
                type="number"
                step="0.01"
                value={form.completedWorkAmt}
                onChange={(e) => updateField("completedWorkAmt", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proposedDueBillAmount">Proposed / due (₹)</Label>
              <Input
                id="proposedDueBillAmount"
                type="number"
                step="0.01"
                value={form.proposedDueBillAmount}
                onChange={(e) => updateField("proposedDueBillAmount", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feeReceived">
                Legacy recorded received amount — unverified (₹)
              </Label>
              <Input
                id="feeReceived"
                type="number"
                step="0.01"
                value={form.feeReceived}
                onChange={(e) => updateField("feeReceived", e.target.value)}
              />
            </div>
          </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Calculated (read-only)</h4>
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Remaining work</p>
              <p className="font-mono font-medium">
                ₹{remainingWorkAmt.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Legacy remaining fee — unverified</p>
              <p className="font-mono font-medium">
                {formatDecimalAsCurrency(remainingFee)}
              </p>
            </div>
          </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              Reconciliation summary
              {detailLoading && (
                <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-zinc-400" />
              )}
            </h4>

            {reconciliationAvailable ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Contract fee</p>
                  <p className="font-mono font-medium">
                    {formatMoney(detailData!.totalContractFee)}
                  </p>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Total invoiced</p>
                  <p className="font-mono font-medium">
                    {formatMoney(detailData!.totalInvoiced)}
                  </p>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Invoice settlement</p>
                  <p className="font-mono font-medium">
                    {formatMoney(detailData!.totalSettlement)}
                  </p>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Recorded cheque</p>
                  <p className="font-mono font-medium">
                    {formatMoney(detailData!.totalRecordedCheque)}
                  </p>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Outstanding (settlement basis)</p>
                  <p className="font-mono font-medium">
                    {formatMoney(detailData!.outstandingPerSettlement)}
                  </p>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Legacy fee received</p>
                  <p className="font-mono font-medium">
                    {formatMoney(detailData!.legacyFeeReceived)}
                  </p>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Contractor RA-bill project expenses (WIP)</p>
                  <p className="font-mono font-medium">
                    {formatMoney(detailData!.wipRaBillProjectExpense)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Reconciliation data unavailable.</p>
            )}

            {reconciliationAvailable && typeof detailData!.recordedCashLabel === "string" && (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                {detailData!.recordedCashLabel as string}
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              Monthly Income Plan (Apr 2026 – Mar 2028)
              {monthlyLoading && (
                <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-zinc-400" />
              )}
            </h4>
            <p className="text-xs text-zinc-500">
              Spread a fee evenly over a number of months — the same style used
              in the customer workbook. You review the amounts before anything
              is saved. The saved monthly total does not have to equal the
              project fee — it may cover part of the fee or a different figure
              such as the fee already received.
            </p>

            {/* Fee vs saved allocations summary */}
            <div className="grid grid-cols-1 gap-2 rounded-md border border-zinc-200 bg-white p-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-zinc-500">Total project fee</div>
                <div className="font-mono font-medium">
                  {formatDecimalAsCurrency(String(project.totalFee))}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Saved monthly total</div>
                <div className="font-mono font-medium">
                  {monthlyTotal != null
                    ? formatDecimalAsCurrency(monthlyTotal)
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">
                  Difference (fee − saved)
                </div>
                <div className="font-mono font-medium">
                  {monthlyTotal != null
                    ? formatDecimalAsCurrency(
                        subtractDecimals(String(project.totalFee), monthlyTotal)
                      )
                    : "—"}
                </div>
              </div>
            </div>
            {(() => {
              const outside = MONTHLY_ALLOCATION_WINDOW.slice(15).filter(
                ({ year, month }) => {
                  const v =
                    monthlyAllocations[
                      `${year}-${String(month).padStart(2, "0")}`
                    ];
                  return v != null && v.trim() !== "";
                }
              );
              if (outside.length === 0) return null;
              return (
                <p className="text-xs text-amber-700">
                  Note: saved amounts in{" "}
                  {outside.map((o) => o.label).join(", ")} are kept as data but
                  are outside the monthly summary formulas (Apr 2026 – Jul 2027).
                </p>
              );
            })()}

            {/* Plan inputs */}
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-basis">Spread which fee?</Label>
                  <select
                    id="plan-basis"
                    className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
                    value={planBasis}
                    onChange={(e) => {
                      setPlanBasis(e.target.value as PlanBasis);
                      setPlanPreview(null);
                    }}
                  >
                    <option value="TOTAL_FEE">Total fee</option>
                    <option value="REMAINING_FEE">
                      Remaining fee (total fee − fee received)
                    </option>
                    <option value="LEGACY_FEE_RECEIVED">
                      Fee already received
                    </option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-months">Number of months</Label>
                  <Input
                    id="plan-months"
                    type="number"
                    min={1}
                    max={24}
                    value={planInstallments}
                    onChange={(e) => {
                      setPlanInstallments(e.target.value);
                      setPlanPreview(null);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-start">Start month</Label>
                  <select
                    id="plan-start"
                    className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
                    value={planStart}
                    onChange={(e) => {
                      setPlanStart(e.target.value);
                      setPlanPreview(null);
                    }}
                  >
                    {MONTHLY_ALLOCATION_WINDOW.map(({ year, month, label }) => (
                      <option key={`${year}-${month}`} value={`${year}-${month}`}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                type="button"
                size="lg"
                onClick={handlePreviewPlan}
                disabled={planLoading || monthlyLoading}
              >
                {planLoading && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                Prepare monthly plan
              </Button>
            </div>

            {/* Plan preview */}
            {planPreview && (
              <div className="rounded-md border border-zinc-200 bg-white p-3 space-y-3">
                {planPreview.unavailableReason ? (
                  <p className="text-sm text-amber-700">
                    {planPreview.unavailableReason}
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-zinc-700">
                      {planPreview.basisLabel}:{" "}
                      <span className="font-mono font-medium">
                        {formatDecimalAsCurrency(planPreview.basisAmount)}
                      </span>
                      {" — each month gets "}
                      <span className="font-mono font-medium">
                        {formatDecimalAsCurrency(planPreview.perMonth)}
                      </span>
                      {` (${planPreview.basisLabel.toLowerCase().includes("received") ? "received" : "fee"} ÷ ${planPreview.installments}).`}
                    </p>
                    <div className="max-h-56 overflow-y-auto rounded border border-zinc-100">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 p-2 text-sm">
                        {planPreview.items.map((item) => {
                          const key = `${item.year}-${item.month}`;
                          if (item.status === "conflict") {
                            const replacing = !!planReplace[key];
                            return (
                              <div
                                key={key}
                                className="col-span-3 rounded bg-amber-50 px-2 py-1.5"
                              >
                                <div className="flex flex-wrap items-baseline gap-x-3">
                                  <span className="font-medium text-zinc-800">
                                    {item.label}
                                  </span>
                                  <span className="font-mono text-xs text-zinc-600">
                                    saved {formatDecimalAsCurrency(item.existingAmount)}
                                  </span>
                                  <span className="font-mono text-xs text-amber-800">
                                    calculated {formatDecimalAsCurrency(item.plannedAmount)}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                                  <label className="inline-flex items-center gap-1.5">
                                    <input
                                      type="radio"
                                      name={`plan-${key}`}
                                      checked={!replacing}
                                      onChange={() =>
                                        setPlanReplace((p) => ({ ...p, [key]: false }))
                                      }
                                    />
                                    Keep {formatDecimalAsCurrency(item.existingAmount)}
                                  </label>
                                  <label className="inline-flex items-center gap-1.5">
                                    <input
                                      type="radio"
                                      name={`plan-${key}`}
                                      checked={replacing}
                                      onChange={() =>
                                        setPlanReplace((p) => ({ ...p, [key]: true }))
                                      }
                                    />
                                    Replace with {formatDecimalAsCurrency(item.plannedAmount)}
                                  </label>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={key} className="col-span-3 grid grid-cols-subgrid items-baseline">
                              <span className="font-medium text-zinc-700">
                                {item.label}
                              </span>
                              <span className="text-right font-mono">
                                {item.plannedAmount != null
                                  ? formatDecimalAsCurrency(item.plannedAmount)
                                  : "—"}
                              </span>
                              <span
                                className={`w-52 text-right text-xs ${
                                  item.status === "create"
                                    ? "text-emerald-700"
                                    : item.status === "keep"
                                      ? "text-zinc-500"
                                      : "text-amber-700"
                                }`}
                              >
                                {item.note}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {planPreview.createCount} month
                      {planPreview.createCount === 1 ? "" : "s"} will be filled
                      {planPreview.keepCount > 0 &&
                        `, ${planPreview.keepCount} already correct`}
                      {planPreview.conflictCount > 0 &&
                        `, ${planPreview.conflictCount} different value${planPreview.conflictCount === 1 ? "" : "s"} to review above`}
                      {planPreview.blockedCount > 0 &&
                        `, ${planPreview.blockedCount} left untouched (older record)`}
                      {planPreview.outsideCount > 0 &&
                        `, ${planPreview.outsideCount} outside the plan window`}
                      .
                    </p>
                    <p className="text-sm">
                      <span className="text-zinc-600">
                        Total after your choices:{" "}
                      </span>
                      <span className="font-mono font-medium">
                        {formatDecimalAsCurrency(planResultTotal())}
                      </span>
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="lg"
                        onClick={handleConfirmPlan}
                        disabled={
                          planSaving ||
                          (planPreview.createCount === 0 &&
                            !Object.values(planReplace).some(Boolean))
                        }
                      >
                        {planSaving && (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        )}
                        Confirm &amp; save monthly plan
                      </Button>
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        onClick={() => setPlanPreview(null)}
                        disabled={planSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            <p className="text-xs text-zinc-500">
              Recorded monthly amounts from customer workbook. Kept separate from
              invoiced and settlement figures.
            </p>

            <details className="space-y-2 rounded-md border border-zinc-200 p-2 [&[open]>summary]:mb-2">
              <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-zinc-500">
                Advanced — edit individual months
              </summary>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {MONTHLY_ALLOCATION_WINDOW.map(({ year, month, label }) => {
                const key = `${year}-${String(month).padStart(2, "0")}`;
                const isUnavailable = monthlyUnavailable[key] != null;
                return (
                  <div key={`i-${year}-${month}`} className="space-y-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      {label}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={monthlySaving || isUnavailable}
                      className={
                        isUnavailable
                          ? "h-8 w-full cursor-not-allowed rounded border border-zinc-200 bg-zinc-100 px-1 text-center text-xs text-zinc-400"
                          : "h-8 w-full rounded border border-zinc-200 px-1 text-right font-mono text-xs focus:border-zinc-400 focus:outline-none disabled:bg-zinc-100"
                      }
                      value={
                        isUnavailable
                          ? "—"
                          : (monthlyAllocations[key] ?? "")
                      }
                      title={
                        isUnavailable
                          ? monthlyUnavailable[key].reason
                          : undefined
                      }
                      onChange={
                        isUnavailable
                          ? undefined
                          : (e) => {
                              setMonthlyAllocations((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }));
                            }
                      }
                      onBlur={
                        isUnavailable
                          ? undefined
                          : (e) => {
                              saveMonthlyAllocation(month, year, e.target.value);
                            }
                      }
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-2 text-xs font-medium text-zinc-700">
              <span>Total</span>
              <span className="font-mono">
                {monthlyTotal != null
                  ? formatDecimalAsCurrency(monthlyTotal)
                  : "—"}
              </span>
            </div>
            </details>
          </div>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Editing fund flow")} askingAi={askingAi} aiResponse={aiResponse} />
          </div>

          <div className="flex justify-end gap-2 border-t bg-popover px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Save fund flow
            </Button>
          </div>
        </form>
    </>
  );

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {body}
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {body}
      </DialogContent>
    </Dialog>
  );
}

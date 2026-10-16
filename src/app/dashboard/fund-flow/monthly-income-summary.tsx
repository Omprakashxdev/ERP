"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMonthlyIncomeSummary } from "@/lib/actions/fund-flow-monthly";
import { Separator } from "@/components/ui/separator";

export function MonthlyIncomeSummary() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<
    Array<{
      month: number;
      year: number;
      label: string;
      totalIncome: { toString: () => string } | null;
      projectCount: number;
      unavailableCount: number;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await getMonthlyIncomeSummary();
        if (!cancelled && result.success && result.data) {
          setSummary(result.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Monthly Income Summary (Row 12)
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
          Monthly Income Summary (Row 12)
        </CardTitle>
        <p className="text-xs text-zinc-500">
          Total income per month across all projects (Apr 2026 – Mar 2028). Excludes
          ambiguous historical records without FF-01K provenance.
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

            {/* Values row */}
            {summary.map(({ totalIncome, projectCount, unavailableCount }) => (
              <div
                key={totalIncome?.toString() ?? "null"}
                className="h-8 flex items-center justify-end px-1 font-mono text-zinc-700"
                title={
                  unavailableCount > 0
                    ? `${projectCount} projects with valid allocations, ${unavailableCount} with ambiguous records excluded`
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

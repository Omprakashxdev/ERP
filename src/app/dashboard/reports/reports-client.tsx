"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, FileBarChart, Calendar, Download } from "lucide-react";
import { runReportAction } from "@/lib/actions/reports";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";
import { formatDateIST, toInputDateIST } from "@/lib/date-utils";

interface ReportCategoryInfo {
  id: string;
  label: string;
  icon: string;
}

interface ReportInfo {
  id: string;
  category: string;
  title: string;
  description: string;
  groupBy?: string[];
}

export function ReportsClient({
  categories,
  reports,
  selectedCategory,
  selectedReportId,
  isModuleFiltered = false,
  moduleLabel,
}: {
  categories: ReportCategoryInfo[];
  reports: ReportInfo[];
  selectedCategory: string;
  selectedReportId?: string;
  isModuleFiltered?: boolean;
  moduleLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  const [result, setResult] = useState<{
    columns: string[];
    rows: Record<string, unknown>[];
    summary?: Record<string, number>;
  } | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const selectCategory = useCallback(
    (cat: string) => {
      router.push(`/dashboard/reports?category=${cat}`);
      setResult(null);
      setError(null);
    },
    [router]
  );

  const selectReport = useCallback(
    (reportId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("report", reportId);
      router.replace(`/dashboard/reports?${params.toString()}`);
      setResult(null);
      setError(null);
    },
    [router, searchParams]
  );

  const handleRun = useCallback(async () => {
    if (!selectedReportId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const params: { dateFrom?: Date; dateTo?: Date } = {};
    if (dateFrom) params.dateFrom = new Date(dateFrom);
    if (dateTo) params.dateTo = new Date(dateTo);

    const res = await runReportAction(selectedReportId, params);
    setLoading(false);

    if (res.success && res.data) {
      setResult(res.data);
      toast.success("Report generated successfully");
    } else {
      setError(res.error ?? "Failed to run report");
      toast.error(res.error ?? "Failed to run report");
    }
  }, [selectedReportId, dateFrom, dateTo]);

  const handleExport = useCallback(() => {
    if (!result || result.rows.length === 0) return;
    const headers = result.columns.join(",");
    const csvRows = result.rows.map((row) =>
      result.columns
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return "";
          if (val instanceof Date) return toInputDateIST(val);
          const str = String(val).replace(/"/g, '""');
          return str.includes(",") || str.includes("\n") ? `"${str}"` : str;
        })
        .join(",")
    );
    const csv = [headers, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${selectedReportId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, selectedReportId]);

  const selectedReport = reports.find((r) => r.id === selectedReportId);

  return (
    <div className={isModuleFiltered ? "space-y-6" : "grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6"}>
      {/* Sidebar: Categories (Only shown in Global Reports view, hidden when filtered by specific module) */}
      {!isModuleFiltered && (
        <div className="space-y-1">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Report Modules
          </p>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => selectCategory(cat.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                selectedCategory === cat.id
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              <FileBarChart className="h-4 w-4 shrink-0" />
              <span className="truncate">{cat.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main area: Report list + results */}
      <div className="space-y-5">
        {/* Report selection cards */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-800">
              {isModuleFiltered
                ? `Available Reports (${reports.length})`
                : `${moduleLabel || "Module"} Reports (${reports.length})`}
            </h2>
            <span className="text-xs text-zinc-500">
              {isModuleFiltered
                ? "Click any report below to filter and generate data"
                : "Select a report to generate and export"}
            </span>
          </div>

          <div
            className={`grid gap-3.5 ${
              isModuleFiltered
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-1 sm:grid-cols-2"
            }`}
          >
            {reports.map((report) => (
              <Card
                key={report.id}
                className={`cursor-pointer transition-all hover:shadow-md hover:border-emerald-300 ${
                  selectedReportId === report.id
                    ? "ring-2 ring-emerald-600 border-emerald-600 bg-emerald-50/20"
                    : "border-zinc-200"
                }`}
                onClick={() => selectReport(report.id)}
              >
                <CardHeader className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-zinc-900 leading-snug">
                      {report.title}
                    </CardTitle>
                    <FileBarChart
                      className={`h-4 w-4 shrink-0 ${
                        selectedReportId === report.id
                          ? "text-emerald-600"
                          : "text-zinc-400"
                      }`}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                    {report.description}
                  </p>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>

        {reports.length === 0 && (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-zinc-400">
            No reports available for this module.
          </div>
        )}

        {/* Date filters + Run button */}
        {selectedReport && (
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">From Date</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">To Date</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8"
                />
              </div>
              <Button onClick={handleRun} disabled={loading} size="sm">
                {loading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Calendar className="mr-1.5 h-3.5 w-3.5" />
                )}
                Run Report
              </Button>
              {result && result.rows.length > 0 && (
                <Button onClick={handleExport} variant="outline" size="sm">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export CSV
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Running report")} askingAi={askingAi} aiResponse={aiResponse} />
        )}

        {/* Summary */}
        {result?.summary && Object.keys(result.summary).length > 0 && (
          <div className="flex flex-wrap gap-3">
            {Object.entries(result.summary).map(([key, val]) => (
              <div
                key={key}
                className="rounded-lg border bg-white px-4 py-2"
              >
                <p className="text-xs text-zinc-500">{key}</p>
                <p className="text-lg font-semibold">
                  {typeof val === "number" && !Number.isInteger(val)
                    ? val.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                    : val.toLocaleString("en-IN")}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Results table */}
        {result && (
          <div className="overflow-hidden rounded-lg border">
            <div className="max-h-[55vh] overflow-auto">
              <Table className="text-xs">
                <TableHeader className="sticky top-0 z-10 bg-white">
                  <TableRow className="hover:bg-transparent">
                    {result.columns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={result.columns.length}
                        className="py-8 text-center text-zinc-400"
                      >
                        No data found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    result.rows.map((row, i) => (
                      <TableRow key={i}>
                        {result.columns.map((col) => {
                          const val = row[col];
                          return (
                            <TableCell key={col} className="whitespace-nowrap">
                              {val === null || val === undefined
                                ? "—"
                                : val instanceof Date
                                  ? formatDateIST(val)
                                  : typeof val === "number"
                                    ? val.toLocaleString("en-IN", {
                                        minimumFractionDigits: Number.isInteger(val) ? 0 : 2,
                                      })
                                    : String(val)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

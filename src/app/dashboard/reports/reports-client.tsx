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
}: {
  categories: ReportCategoryInfo[];
  reports: ReportInfo[];
  selectedCategory: string;
  selectedReportId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      router.push(`/dashboard/reports?${params.toString()}`);
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
    } else {
      setError(res.error ?? "Failed to run report");
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
          if (val instanceof Date) return val.toISOString().split("T")[0];
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
    <div className="grid grid-cols-[200px_1fr] gap-4">
      {/* Sidebar: Categories */}
      <div className="space-y-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => selectCategory(cat.id)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
              selectedCategory === cat.id
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <FileBarChart className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Main area: Report list + results */}
      <div className="space-y-4">
        {/* Report selection cards */}
        <div className="grid grid-cols-2 gap-3">
          {reports.map((report) => (
            <Card
              key={report.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${
                selectedReportId === report.id ? "ring-2 ring-zinc-900" : ""
              }`}
              onClick={() => selectReport(report.id)}
            >
              <CardHeader className="p-3">
                <CardTitle className="text-sm">{report.title}</CardTitle>
                <p className="text-xs text-zinc-500">{report.description}</p>
              </CardHeader>
            </Card>
          ))}
        </div>

        {reports.length === 0 && (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-zinc-400">
            No reports in this category.
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
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
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
                                  ? val.toLocaleDateString("en-IN")
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

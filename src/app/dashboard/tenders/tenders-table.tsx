"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { TenderStatus } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TenderFilterInput } from "@/lib/schemas/tender";
import { TenderWithComputed } from "@/types/tender";
import { TenderForm } from "./tender-form";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
} from "lucide-react";

interface TendersTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: TenderFilterInput;
}

const statusVariantMap: Record<TenderStatus, string> = {
  [TenderStatus.UNDER_PREPARATION]:
    "bg-zinc-100 text-zinc-700 border-zinc-200",
  [TenderStatus.SUBMITTED]: "bg-blue-50 text-blue-700 border-blue-200",
  [TenderStatus.UNDER_EVALUATION]:
    "bg-amber-50 text-amber-700 border-amber-200",
  [TenderStatus.WON]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [TenderStatus.LOST]: "bg-red-50 text-red-700 border-red-200",
  [TenderStatus.WITHDRAWN]: "bg-zinc-100 text-zinc-700 border-zinc-200",
  [TenderStatus.CANCELLED]: "bg-red-50 text-red-700 border-red-200",
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(
  value: Decimal | string | number | null | undefined
): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : Number(value);
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ");
}

export function TendersTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  filter,
}: TendersTableProps) {
  const router = useRouter();
  const [selectedTender, setSelectedTender] =
    useState<TenderWithComputed | null>(null);
  const [createTenderOpen, setCreateTenderOpen] = useState(false);

  if (rows.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No tender records</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Add a tender to start tracking bidding, EMD, and price comparison.
          </p>
        </CardContent>
      </Card>
    );
  }

  const typedRows = rows as TenderWithComputed[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (filter.status) params.set("status", filter.status);
    if (filter.workType) params.set("workType", filter.workType);
    if (filter.serviceType) params.set("serviceType", filter.serviceType);
    if (filter.state?.trim()) params.set("state", filter.state.trim());
    if (filter.city?.trim()) params.set("city", filter.city.trim());
    if (filter.platform?.trim())
      params.set("platform", filter.platform.trim());
    if (filter.fromDate)
      params.set("fromDate", filter.fromDate.toISOString().split("T")[0]);
    if (filter.toDate)
      params.set("toDate", filter.toDate.toISOString().split("T")[0]);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">Tender records</h2>
        <Button size="sm" onClick={() => setCreateTenderOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New tender
        </Button>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Tender</TableHead>
                <TableHead className="whitespace-nowrap">Tender ID</TableHead>
                <TableHead className="whitespace-nowrap">Department</TableHead>
                <TableHead className="whitespace-nowrap">Location</TableHead>
                <TableHead className="whitespace-nowrap">Platform</TableHead>
                <TableHead className="whitespace-nowrap">Work Name</TableHead>
                <TableHead className="whitespace-nowrap">Type</TableHead>
                <TableHead className="whitespace-nowrap">Service</TableHead>
                <TableHead className="whitespace-nowrap">
                  Bidding Last Date
                </TableHead>
                <TableHead className="whitespace-nowrap">Opening</TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  Tender Fee
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  EMD
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  L1
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  L2
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  L3
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.tenderDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className={statusVariantMap[row.status]}
                    >
                      {row.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-medium">
                    {row.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.tenderId ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.department ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {[row.city, row.state].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.platform ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {row.workName ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatEnum(row.workType)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatEnum(row.serviceType)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.biddingLastDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.dateOfOpening)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.tenderFeeAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.emdAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.l1Amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.l2Amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.l3Amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setSelectedTender(row)}
                      title="Edit tender"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                router.push(`/dashboard/tenders${buildQueryString(page - 1)}`)
              }
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() =>
                router.push(`/dashboard/tenders${buildQueryString(page + 1)}`)
              }
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedTender && (
        <TenderForm
          tender={selectedTender}
          mode="edit"
          onClose={() => setSelectedTender(null)}
        />
      )}

      {createTenderOpen && (
        <TenderForm mode="create" onClose={() => setCreateTenderOpen(false)} />
      )}
    </div>
  );
}

export function TendersTableSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-0">
        <div className="space-y-2 p-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

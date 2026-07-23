"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { PaymentScheduleStatus, PaymentScheduleCategory } from "@prisma/client";
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
import { PaymentScheduleFilterInput } from "@/lib/schemas/payment-schedule";
import { PaymentScheduleWithComputed } from "@/types/payment-schedules";
import { PaymentScheduleForm } from "./payment-schedule-form";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
} from "lucide-react";

interface PaymentSchedulesTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: PaymentScheduleFilterInput;
}

const statusVariantMap: Record<PaymentScheduleStatus, string> = {
  [PaymentScheduleStatus.PENDING]:
    "bg-amber-50 text-amber-700 border-amber-200",
  [PaymentScheduleStatus.PAID]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [PaymentScheduleStatus.OVERDUE]: "bg-red-50 text-red-700 border-red-200",
  [PaymentScheduleStatus.CANCELLED]:
    "bg-zinc-100 text-zinc-700 border-zinc-200",
};

const categoryVariantMap: Record<PaymentScheduleCategory, string> = {
  [PaymentScheduleCategory.EXCISE]:
    "bg-purple-50 text-purple-700 border-purple-200",
  [PaymentScheduleCategory.GST]: "bg-blue-50 text-blue-700 border-blue-200",
  [PaymentScheduleCategory.TDS]: "bg-orange-50 text-orange-700 border-orange-200",
  [PaymentScheduleCategory.VEHICLE_LOAN]:
    "bg-cyan-50 text-cyan-700 border-cyan-200",
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

export function PaymentSchedulesTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  filter,
}: PaymentSchedulesTableProps) {
  const router = useRouter();
  const [selectedSchedule, setSelectedSchedule] =
    useState<PaymentScheduleWithComputed | null>(null);
  const [createScheduleOpen, setCreateScheduleOpen] = useState(false);

  if (rows.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No payment schedules</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Add a scheduled payment to track GST, TDS, Excise, or Vehicle Loan
            dues.
          </p>
        </CardContent>
      </Card>
    );
  }

  const typedRows = rows as PaymentScheduleWithComputed[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (filter.category) params.set("category", filter.category);
    if (filter.status) params.set("status", filter.status);
    if (filter.fromDate)
      params.set("fromDate", filter.fromDate.toISOString().split("T")[0]);
    if (filter.toDate)
      params.set("toDate", filter.toDate.toISOString().split("T")[0]);
    if (filter.dueDateFrom)
      params.set("dueDateFrom", filter.dueDateFrom.toISOString().split("T")[0]);
    if (filter.dueDateTo)
      params.set("dueDateTo", filter.dueDateTo.toISOString().split("T")[0]);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">Payment schedules</h2>
        <Button size="sm" onClick={() => setCreateScheduleOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New schedule
        </Button>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead className="whitespace-nowrap">Due Date</TableHead>
                <TableHead className="whitespace-nowrap">Category</TableHead>
                <TableHead className="whitespace-nowrap">Payment Type</TableHead>
                <TableHead className="whitespace-nowrap">Detail</TableHead>
                <TableHead className="whitespace-nowrap text-right">Amount</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.dueDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className={categoryVariantMap[row.category]}
                    >
                      {formatEnum(row.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.paymentType ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {row.detail ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className={statusVariantMap[row.status]}
                    >
                      {row.status.toLowerCase().replace(/_/g, " ")}
                      {row.isOverdue && row.status !== "OVERDUE"
                        ? " (overdue)"
                        : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setSelectedSchedule(row)}
                      title="Edit schedule"
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
                router.push(
                  `/dashboard/payment-schedules${buildQueryString(page - 1)}`
                )
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
                router.push(
                  `/dashboard/payment-schedules${buildQueryString(page + 1)}`
                )
              }
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedSchedule && (
        <PaymentScheduleForm
          paymentSchedule={selectedSchedule}
          mode="edit"
          onClose={() => setSelectedSchedule(null)}
        />
      )}

      {createScheduleOpen && (
        <PaymentScheduleForm
          mode="create"
          onClose={() => setCreateScheduleOpen(false)}
        />
      )}
    </div>
  );
}

export function PaymentSchedulesTableSkeleton() {
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

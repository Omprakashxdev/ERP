"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
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
import { DueBillFilterInput } from "@/lib/schemas/due-bill";
import { DueBillWithComputed, DueBillStatus } from "@/types/due-bills";
import { DueBillForm } from "./due-bill-form";
import { InvoiceDialog } from "./invoice-dialog";
import { ReminderLetterDialog } from "./reminder-letter-dialog";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
  FileText,
  MailWarning,
} from "lucide-react";

interface DueBillsTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: DueBillFilterInput;
  projects: { id: string; name: string }[];
  staff?: { id: string; name: string }[];
}

const statusVariantMap: Record<DueBillStatus, string> = {
  [DueBillStatus.PENDING]: "bg-amber-50 text-amber-700 border-amber-200",
  [DueBillStatus.PARTIAL]: "bg-blue-50 text-blue-700 border-blue-200",
  [DueBillStatus.PAID]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [DueBillStatus.ON_HOLD]: "bg-zinc-100 text-zinc-700 border-zinc-200",
  [DueBillStatus.CANCELLED]: "bg-red-50 text-red-700 border-red-200",
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: Decimal | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : Number(value);
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function DueBillsTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  filter,
  projects,
  staff,
}: DueBillsTableProps) {
  const router = useRouter();
  const [selectedBill, setSelectedBill] = useState<DueBillWithComputed | null>(
    null
  );
  const [invoiceBill, setInvoiceBill] = useState<DueBillWithComputed | null>(
    null
  );
  const [reminderBill, setReminderBill] = useState<DueBillWithComputed | null>(
    null
  );
  const [createBillOpen, setCreateBillOpen] = useState(false);

  if (rows.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No Due Bill records</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Add a bill to start tracking consultancy billing status.
          </p>
        </CardContent>
      </Card>
    );
  }

  const typedRows = rows as DueBillWithComputed[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (filter.regionId) params.set("regionId", filter.regionId);
    if (filter.clientId) params.set("clientId", filter.clientId);
    if (filter.projectId) params.set("projectId", filter.projectId);
    if (filter.status) params.set("status", filter.status);
    if (filter.scheme) params.set("scheme", filter.scheme);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">Due Bills records</h2>
        <Button size="sm" onClick={() => setCreateBillOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New bill
        </Button>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Sr. No.</TableHead>
                <TableHead className="whitespace-nowrap">Region</TableHead>
                <TableHead className="whitespace-nowrap">Client</TableHead>
                <TableHead className="whitespace-nowrap">Project</TableHead>
                <TableHead className="whitespace-nowrap">Scheme</TableHead>
                <TableHead className="whitespace-nowrap">Bill Date</TableHead>
                <TableHead className="whitespace-nowrap text-right">Gross</TableHead>
                <TableHead className="whitespace-nowrap text-right">SGST</TableHead>
                <TableHead className="whitespace-nowrap text-right">CGST</TableHead>
                <TableHead className="whitespace-nowrap text-right">Bill Amt</TableHead>
                <TableHead className="whitespace-nowrap text-right">Received</TableHead>
                <TableHead className="whitespace-nowrap text-right">Cheque</TableHead>
                <TableHead className="whitespace-nowrap text-right">SD</TableHead>
                <TableHead className="whitespace-nowrap text-right">IT/TDS</TableHead>
                <TableHead className="whitespace-nowrap text-right">Pending</TableHead>
                <TableHead className="whitespace-nowrap">Rcv Date</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Remarks</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {(page - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.project.region.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.project.client.name}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {row.project.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.scheme}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.billDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.grossAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.sgst)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.cgst)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.billAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.receivedAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.chequeAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.sd)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.itTds)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.pendingAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.receiveDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className={statusVariantMap[row.computedStatus]}
                    >
                      {row.computedStatus.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {row.remarks ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setSelectedBill(row)}
                        title="Edit bill"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setInvoiceBill(row)}
                        title="Generate invoice"
                      >
                        <FileText className="h-3.5 w-3.5 text-blue-600" />
                      </Button>
                      {(row.computedStatus === "PENDING" || row.computedStatus === "PARTIAL") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setReminderBill(row)}
                          title="Generate reminder letter"
                        >
                          <MailWarning className="h-3.5 w-3.5 text-amber-600" />
                        </Button>
                      )}
                    </div>
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
                router.push(`/dashboard/due-bills${buildQueryString(page - 1)}`)
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
                router.push(`/dashboard/due-bills${buildQueryString(page + 1)}`)
              }
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedBill && (
        <DueBillForm
          bill={selectedBill}
          mode="edit"
          projects={projects}
          onClose={() => setSelectedBill(null)}
        />
      )}

      {createBillOpen && (
        <DueBillForm
          mode="create"
          projects={projects}
          onClose={() => setCreateBillOpen(false)}
        />
      )}

      {invoiceBill && (
        <InvoiceDialog
          bill={invoiceBill as unknown as Parameters<typeof InvoiceDialog>[0]["bill"]}
          onClose={() => setInvoiceBill(null)}
        />
      )}

      {reminderBill && (
        <ReminderLetterDialog
          bill={reminderBill as unknown as Parameters<typeof ReminderLetterDialog>[0]["bill"]}
          onClose={() => setReminderBill(null)}
        />
      )}

    </div>
  );
}

export function DueBillsTableSkeleton() {
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

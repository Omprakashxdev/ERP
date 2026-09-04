"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { InOutRegisterFilterInput } from "@/lib/schemas/in-out-register";
import { InOutRegisterWithComputed } from "@/types/in-out-register";
import { InOutRegisterForm } from "./in-out-register-form";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Pencil,
  Plus,
} from "lucide-react";

interface InOutRegisterTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: InOutRegisterFilterInput;
  clients: { id: string; name: string; abbreviation: string | null }[];
  departments?: { id: string; name: string }[];
  staff: { id: string; name: string; employeeCode: string | null }[];
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function truncate(value: string | null | undefined, max = 40): string {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function InOutRegisterTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  filter,
  clients,
  departments,
  staff,
}: InOutRegisterTableProps) {
  const router = useRouter();
  const [selectedEntry, setSelectedEntry] =
    useState<InOutRegisterWithComputed | null>(null);
  const [createEntryOpen, setCreateEntryOpen] = useState(false);

  const typedRows = rows as InOutRegisterWithComputed[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (filter.direction) params.set("direction", filter.direction);
    if (filter.clientId) params.set("clientId", filter.clientId);
    if (filter.actionSuggestedStaffId)
      params.set("actionSuggestedStaffId", filter.actionSuggestedStaffId);
    if (filter.ccStaffId) params.set("ccStaffId", filter.ccStaffId);
    if (filter.hasReply) params.set("hasReply", filter.hasReply);
    if (filter.receivedDateFrom)
      params.set(
        "receivedDateFrom",
        filter.receivedDateFrom.toISOString().split("T")[0]
      );
    if (filter.receivedDateTo)
      params.set(
        "receivedDateTo",
        filter.receivedDateTo.toISOString().split("T")[0]
      );
    if (filter.ageDue) params.set("ageDue", filter.ageDue);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">In-out entries</h2>
        <Button size="sm" onClick={() => setCreateEntryOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New entry
        </Button>
      </div>

      {typedRows.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ArrowLeftRight className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">No entries</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500 mb-4">
              Add an inward or outward document to start tracking entries.
            </p>
            <Button size="sm" onClick={() => setCreateEntryOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New entry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm">
          <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Doc Date</TableHead>
                <TableHead className="whitespace-nowrap">Rec. / Sent Date</TableHead>
                <TableHead className="whitespace-nowrap">Doc Ref. No</TableHead>
                <TableHead className="whitespace-nowrap">Direction</TableHead>
                <TableHead className="whitespace-nowrap">From / To</TableHead>
                <TableHead className="whitespace-nowrap">Dept / Division</TableHead>
                <TableHead className="whitespace-nowrap">Details</TableHead>
                <TableHead className="whitespace-nowrap">CC marking</TableHead>
                <TableHead className="whitespace-nowrap">Action</TableHead>
                <TableHead className="whitespace-nowrap">Reply</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => setSelectedEntry(row)}
                  className="cursor-pointer hover:bg-zinc-50/70 transition-colors"
                >
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.documentDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.receivedDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-semibold text-zinc-900">
                    {row.documentRefNo}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="outline" className={row.direction === "OUTWARD" ? "text-blue-700" : "text-zinc-700"}>
                      {row.direction === "OUTWARD" ? "Outward" : "Inward"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium text-zinc-800">
                    {row.client.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-600">
                    {row.department || "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {truncate(row.details)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {row.ccStaffNames || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.actionSuggestedStaff?.name ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.replyDate ? (
                      <span className="text-xs">
                        {formatDate(row.replyDate)}
                        <br />
                        <span className="text-zinc-500 font-mono text-[11px]">{row.replyRefNo}</span>
                      </span>
                    ) : row.replyDueDate ? (
                      <span className="text-xs text-amber-800 font-medium">
                        Due: {formatDate(row.replyDueDate)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.direction === "OUTWARD" ? (
                      <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 font-medium">
                        Dispatched
                      </Badge>
                    ) : !row.replyRequired ? (
                      <Badge variant="outline" className="border-zinc-200 text-zinc-500 bg-zinc-50">
                        Informational
                      </Badge>
                    ) : row.replyDate ? (
                      <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 font-medium">
                        Replied
                      </Badge>
                    ) : row.isOverdue ? (
                      <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 font-semibold">
                        Overdue ({row.daysOverdue}d)
                      </Badge>
                    ) : row.replyDueDate ? (
                      <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-50 font-medium">
                        Pending (Due {formatDate(row.replyDueDate)})
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 font-medium">
                        Pending ({row.ageInDays}d)
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className="whitespace-nowrap text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntry(row);
                      }}
                      title="Edit entry"
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
      )}

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
              onClick={() => router.push(`/dashboard/in-out-register${buildQueryString(page - 1)}`)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => router.push(`/dashboard/in-out-register${buildQueryString(page + 1)}`)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedEntry && (
        <InOutRegisterForm
          entry={selectedEntry}
          clients={clients}
          departments={departments}
          staff={staff}
          mode="edit"
          onClose={() => setSelectedEntry(null)}
        />
      )}

      {createEntryOpen && (
        <InOutRegisterForm
          clients={clients}
          departments={departments}
          staff={staff}
          mode="create"
          onClose={() => setCreateEntryOpen(false)}
        />
      )}
    </div>
  );
}

export function InOutRegisterTableSkeleton() {
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

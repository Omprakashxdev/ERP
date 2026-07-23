"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import {
  WipCoordinatorLevel,
  WipStatus,
} from "@prisma/client";
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
import { WipFilterInput } from "@/lib/schemas/wip";
import { WipWithComputed } from "@/types/wip";
import { WipForm } from "./wip-form";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
} from "lucide-react";

interface WipTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: WipFilterInput;
  projects: { id: string; name: string }[];
  staff: { id: string; name: string | null }[];
}

const statusVariantMap: Record<WipStatus, string> = {
  [WipStatus.NOT_STARTED]: "bg-zinc-100 text-zinc-700 border-zinc-200",
  [WipStatus.IN_PROGRESS]: "bg-blue-50 text-blue-700 border-blue-200",
  [WipStatus.ON_HOLD]: "bg-amber-50 text-amber-700 border-amber-200",
  [WipStatus.COMPLETED]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [WipStatus.CANCELLED]: "bg-red-50 text-red-700 border-red-200",
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

function formatMonths(value: Decimal | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : Number(value);
  return num.toFixed(2);
}

function getStaffName(staff: { id: string; name: string | null } | null | undefined): string {
  return staff?.name ?? "—";
}

function getStaffByLevel(
  row: WipWithComputed,
  level: WipCoordinatorLevel
): string {
  const assignment = row.assignments.find((a) => a.level === level);
  return assignment?.staff.name ?? "—";
}

export function WipTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  filter,
  projects,
  staff,
}: WipTableProps) {
  const router = useRouter();
  const [selectedWip, setSelectedWip] = useState<WipWithComputed | null>(null);
  const [createWipOpen, setCreateWipOpen] = useState(false);

  if (rows.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No WIP records</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Add a work-in-progress record to start tracking project lifecycle.
          </p>
        </CardContent>
      </Card>
    );
  }

  const typedRows = rows as WipWithComputed[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (filter.regionId) params.set("regionId", filter.regionId);
    if (filter.clientId) params.set("clientId", filter.clientId);
    if (filter.projectId) params.set("projectId", filter.projectId);
    if (filter.status) params.set("status", filter.status);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">WIP records</h2>
        <Button size="sm" onClick={() => setCreateWipOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New WIP record
        </Button>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Region</TableHead>
                <TableHead className="whitespace-nowrap">Client</TableHead>
                <TableHead className="whitespace-nowrap">Project</TableHead>
                <TableHead className="whitespace-nowrap">Work Order</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap text-right">Time Limit</TableHead>
                <TableHead className="whitespace-nowrap">Stipulated</TableHead>
                <TableHead className="whitespace-nowrap">Target</TableHead>
                <TableHead className="whitespace-nowrap">HO Coordinator</TableHead>
                <TableHead className="whitespace-nowrap">RO Coordinator</TableHead>
                <TableHead className="whitespace-nowrap">L1</TableHead>
                <TableHead className="whitespace-nowrap">L2</TableHead>
                <TableHead className="whitespace-nowrap">L3</TableHead>
                <TableHead className="whitespace-nowrap">L4</TableHead>
                <TableHead className="whitespace-nowrap text-right">SD Amount</TableHead>
                <TableHead className="whitespace-nowrap text-right">Work Done</TableHead>
                <TableHead className="whitespace-nowrap text-right">RA 1</TableHead>
                <TableHead className="whitespace-nowrap text-right">RA 2</TableHead>
                <TableHead className="whitespace-nowrap text-right">RA 3</TableHead>
                <TableHead className="whitespace-nowrap text-right">RA 4</TableHead>
                <TableHead className="whitespace-nowrap text-right">Final Progress</TableHead>
                <TableHead className="whitespace-nowrap">Completion</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {row.project.region.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.project.client.name}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {row.project.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.workOrderDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className={statusVariantMap[row.status]}
                    >
                      {row.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {formatMonths(row.timeLimitMonths)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.stipulatedCompletionDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.targetCompletionDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffName(row.hoCoordinator)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffName(row.roCoordinator)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffByLevel(row, WipCoordinatorLevel.L1)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffByLevel(row, WipCoordinatorLevel.L2)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffByLevel(row, WipCoordinatorLevel.L3)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffByLevel(row, WipCoordinatorLevel.L4)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.securityDepositAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.amountOfWorkDone)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.raBill1Amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.raBill2Amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.raBill3Amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.raBill4Amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.finalProgressAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.completionDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setSelectedWip(row)}
                      title="Edit WIP record"
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
              onClick={() => router.push(`/dashboard/wip${buildQueryString(page - 1)}`)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => router.push(`/dashboard/wip${buildQueryString(page + 1)}`)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedWip && (
        <WipForm
          wip={selectedWip}
          mode="edit"
          projects={projects}
          staff={staff}
          onClose={() => setSelectedWip(null)}
        />
      )}

      {createWipOpen && (
        <WipForm
          mode="create"
          projects={projects}
          staff={staff}
          onClose={() => setCreateWipOpen(false)}
        />
      )}
    </div>
  );
}

export function WipTableSkeleton() {
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

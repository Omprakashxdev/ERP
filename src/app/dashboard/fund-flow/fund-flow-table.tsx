"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { formatMoney } from "@/lib/format-money";
import {
  ProjectStatus,
  ProjectRole,
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
import { FundFlowFilterInput } from "@/lib/schemas/fund-flow";
import type { FundFlowWithComputed } from "@/types/fund-flow";
import { ProjectForm } from "./project-form";
import { FundFlowEditor } from "./fund-flow-editor";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Plus,
} from "lucide-react";

interface FundFlowTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: FundFlowFilterInput;
  regions: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  staff: { id: string; name: string | null }[];
}

const statusVariantMap: Record<ProjectStatus, string> = {
  [ProjectStatus.ACTIVE]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [ProjectStatus.COMPLETED]: "bg-blue-50 text-blue-700 border-blue-200",
  [ProjectStatus.ON_HOLD]: "bg-amber-50 text-amber-700 border-amber-200",
  [ProjectStatus.CANCELLED]: "bg-red-50 text-red-700 border-red-200",
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMonths(value: Decimal | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : Number(value);
  return num.toFixed(2);
}

function getStaffByRole(
  row: FundFlowWithComputed,
  role: ProjectRole
): string {
  const assignment = row.assignments.find((a) => a.role === role);
  return assignment?.staff.name ?? "—";
}

export function FundFlowTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  filter,
}: FundFlowTableProps) {
  const router = useRouter();
  const [selectedFundFlow, setSelectedFundFlow] =
    useState<FundFlowWithComputed | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const typedRows = rows as FundFlowWithComputed[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (filter.regionId) params.set("regionId", filter.regionId);
    if (filter.clientId) params.set("clientId", filter.clientId);
    if (filter.status) params.set("status", filter.status);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">Fund Flow records</h2>
        <Button
          size="sm"
          onClick={() => setCreateProjectOpen(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New project
        </Button>
      </div>

      {typedRows.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">No Fund Flow records</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500 mb-4">
              Add a project to start tracking fund flow.
            </p>
            <Button
              size="sm"
              onClick={() => setCreateProjectOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm">
          <Table className="text-sm">
            <TableHeader className="bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead>Region</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Completed Work</TableHead>
                <TableHead className="text-right">Remaining Work</TableHead>
                <TableHead className="text-right">Total Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row) => {
                const expanded = expandedRowId === row.id;
                return (
                  <Fragment key={row.id}>
                  <TableRow
                    key={row.id}
                    onClick={() => setSelectedFundFlow(row)}
                    className="cursor-pointer hover:bg-zinc-50/70 transition-colors"
                  >
                    <TableCell className="font-medium">
                      {row.region.name}
                    </TableCell>
                    <TableCell>{row.client.name}</TableCell>
                    <TableCell className="max-w-[16rem] font-medium text-zinc-900">
                      <div className="truncate" title={row.name}>{row.name}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {formatMoney(row.fundFlow?.totalProjectCost)}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {formatMoney(row.fundFlow?.completedWorkAmt)}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {formatMoney(row.remainingWorkAmt)}
                    </TableCell>
                    <TableCell
                      className="text-right font-mono whitespace-nowrap"
                      title={row.totalFee != null ? `Exact: ₹${formatMoney(row.totalFee, 6)}` : undefined}
                    >
                      {formatMoney(row.totalFee)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusVariantMap[row.status]}
                      >
                        {row.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedRowId(expanded ? null : row.id);
                          }}
                          title={expanded ? "Hide details" : "Show all details"}
                          aria-expanded={expanded}
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFundFlow(row);
                          }}
                        >
                          View / Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow key={`${row.id}-details`} className="bg-zinc-50/60 hover:bg-zinc-50/60">
                      <TableCell colSpan={9} className="p-0">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
                          <div>
                            <p className="text-xs text-zinc-500">Work order date</p>
                            <p className="font-medium">{formatDate(row.workOrderDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Time limit (months)</p>
                            <p className="font-medium">{formatMonths(row.timeLimitMonths)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Stipulated completion</p>
                            <p className="font-medium">{formatDate(row.stipulatedCompletionDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Target completion</p>
                            <p className="font-medium">{formatDate(row.targetCompletionDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Target months</p>
                            <p className="font-medium">{formatMonths(row.targetTimeLimitMonths)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Team leader</p>
                            <p className="font-medium">{getStaffByRole(row, ProjectRole.TEAM_LEADER)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Residential engineer</p>
                            <p className="font-medium">{getStaffByRole(row, ProjectRole.RESIDENTIAL_ENGINEER)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Design engineer</p>
                            <p className="font-medium">{getStaffByRole(row, ProjectRole.DESIGN_ENGINEER)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Site engineer</p>
                            <p className="font-medium">{getStaffByRole(row, ProjectRole.SITE_ENGINEER)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Misc expenses</p>
                            <p className="font-mono">{formatMoney(row.fundFlow?.miscExp)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Staff expenses</p>
                            <p className="font-mono">{formatMoney(row.fundFlow?.staffExp)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Proposed / due amount</p>
                            <p className="font-mono">{formatMoney(row.fundFlow?.proposedDueBillAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Fee received (legacy — unverified)</p>
                            <p className="font-mono">{formatMoney(row.fundFlow?.feeReceived)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Remaining fee (legacy — unverified)</p>
                            <p className="font-mono">{formatMoney(row.remainingFee, 6)}</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
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
              onClick={() => router.push(`/dashboard/fund-flow${buildQueryString(page - 1)}`)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => router.push(`/dashboard/fund-flow${buildQueryString(page + 1)}`)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {createProjectOpen && (
        <ProjectForm
          mode="create"
          onClose={() => setCreateProjectOpen(false)}
        />
      )}

      {selectedFundFlow && (
        <FundFlowEditor
          project={selectedFundFlow}
          onClose={() => setSelectedFundFlow(null)}
        />
      )}
    </div>
  );
}

export function FundFlowTableSkeleton() {
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

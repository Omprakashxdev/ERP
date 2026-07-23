"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
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
import { FundFlowWithComputed } from "@/types/fund-flow";
import { ProjectForm } from "./project-form";
import { FundFlowForm } from "./fund-flow-form";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
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
  const [selectedProject, setSelectedProject] =
    useState<FundFlowWithComputed | null>(null);
  const [selectedFundFlow, setSelectedFundFlow] =
    useState<FundFlowWithComputed | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  if (rows.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No Fund Flow records</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Add a project to start tracking fund flow.
          </p>
        </CardContent>
      </Card>
    );
  }

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

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Region</TableHead>
                <TableHead className="whitespace-nowrap">Client</TableHead>
                <TableHead className="whitespace-nowrap">Project</TableHead>
                <TableHead className="whitespace-nowrap">Work Order</TableHead>
                <TableHead className="whitespace-nowrap text-right">Time Limit</TableHead>
                <TableHead className="whitespace-nowrap">Stipulated</TableHead>
                <TableHead className="whitespace-nowrap">Target</TableHead>
                <TableHead className="whitespace-nowrap text-right">Target Months</TableHead>
                <TableHead className="whitespace-nowrap">TL/PM</TableHead>
                <TableHead className="whitespace-nowrap">RE</TableHead>
                <TableHead className="whitespace-nowrap">DE</TableHead>
                <TableHead className="whitespace-nowrap">SE</TableHead>
                <TableHead className="whitespace-nowrap text-right">Misc Exp</TableHead>
                <TableHead className="whitespace-nowrap text-right">Staff Exp</TableHead>
                <TableHead className="whitespace-nowrap text-right">Total Cost</TableHead>
                <TableHead className="whitespace-nowrap text-right">Completed</TableHead>
                <TableHead className="whitespace-nowrap text-right">Remaining</TableHead>
                <TableHead className="whitespace-nowrap text-right">Total Fee</TableHead>
                <TableHead className="whitespace-nowrap text-right">Proposed/Due</TableHead>
                <TableHead className="whitespace-nowrap text-right">Received</TableHead>
                <TableHead className="whitespace-nowrap text-right">Remaining Fee</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {row.region.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.client.name}</TableCell>
                  <TableCell className="max-w-xs truncate">{row.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.workOrderDate)}
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
                  <TableCell className="whitespace-nowrap text-right">
                    {formatMonths(row.targetTimeLimitMonths)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffByRole(row, ProjectRole.TEAM_LEADER)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffByRole(row, ProjectRole.RESIDENTIAL_ENGINEER)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffByRole(row, ProjectRole.DESIGN_ENGINEER)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getStaffByRole(row, ProjectRole.SITE_ENGINEER)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.fundFlow?.miscExp)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.fundFlow?.staffExp)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.fundFlow?.totalProjectCost)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.fundFlow?.completedWorkAmt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.remainingWorkAmt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.totalFee)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.fundFlow?.proposedDueBillAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.fundFlow?.feeReceived)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.remainingFee)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className={statusVariantMap[row.status]}
                    >
                      {row.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setSelectedProject(row)}
                        title="Edit project"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setSelectedFundFlow(row)}
                        title="Edit fund flow"
                      >
                        ₹
                      </Button>
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

      {selectedProject && (
        <ProjectForm
          project={selectedProject}
          mode="edit"
          onClose={() => setSelectedProject(null)}
        />
      )}

      {createProjectOpen && (
        <ProjectForm
          mode="create"
          onClose={() => setCreateProjectOpen(false)}
        />
      )}

      {selectedFundFlow && (
        <FundFlowForm
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

"use client";

import Link from "next/link";
import { ProjectStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format-money";
import type { FundFlowWithComputed } from "@/types/fund-flow";
import { ExternalLink, Building2, Users, Layers } from "lucide-react";

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

function formatMonths(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "—";
}

interface ProjectSummaryViewProps {
  project: FundFlowWithComputed;
  canManageProjects?: boolean;
  showEditInMastersLink?: boolean;
}

export function ProjectSummaryView({
  project,
  canManageProjects = false,
  showEditInMastersLink = false,
}: ProjectSummaryViewProps) {
  const editHref = `/dashboard/masters?tab=projects&edit=${encodeURIComponent(project.id)}`;

  return (
    <div className="space-y-5 overflow-y-auto py-1">
      {showEditInMastersLink && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm">
          <div>
            <p className="font-medium text-blue-950">
              Project master information is read-only in Fund Flow
            </p>
            <p className="text-xs text-blue-800/80">
              Project details, timelines, staff assignments, and fee stages are managed centrally under Masters → Projects.
            </p>
          </div>
          {canManageProjects && (
            <Button
              variant="outline"
              size="sm"
              className="border-blue-300 bg-white text-blue-900 hover:bg-blue-100"
              render={<Link href={editHref} />}
              nativeButton={false}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Edit in Masters
            </Button>
          )}
        </div>
      )}

      {/* Project Details */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-zinc-500" />
            <h4 className="text-sm font-semibold text-zinc-800">Project Details</h4>
          </div>
          <Badge variant="outline" className={statusVariantMap[project.status]}>
            {project.status.toLowerCase().replace(/_/g, " ")}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs text-zinc-500">Project name</p>
            <p className="font-medium text-zinc-900">{project.name}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Abbreviation</p>
            <p className="font-mono font-medium">{project.abbreviation || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Region</p>
            <p className="font-medium">{project.region?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Client</p>
            <p className="font-medium">{project.client?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Work type</p>
            <p className="font-medium">{project.workType || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Service type</p>
            <p className="font-medium">{project.serviceType || "—"}</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-zinc-500">Address</p>
            <p className="font-medium">{project.address || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Date of Work Order</p>
            <p className="font-medium">{formatDate(project.workOrderDate)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Agreement date</p>
            <p className="font-medium">{formatDate(project.agreementDate)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Time Limit (in Month)</p>
            <p className="font-mono font-medium">{formatMonths(project.timeLimitMonths)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Grace period (months)</p>
            <p className="font-mono font-medium">{formatMonths(project.additionalTimeMonths)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Target Time Limit (In Month)</p>
            <p className="font-mono font-medium">{formatMonths(project.targetTimeLimitMonths)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Stipulated Date of Completion</p>
            <p className="font-medium">{formatDate(project.stipulatedCompletionDate)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Target Date of Completion</p>
            <p className="font-medium">{formatDate(project.targetCompletionDate)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Estimated cost (₹)</p>
            <p className="font-mono font-medium">₹{formatMoney(project.estimatedCost)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Total Fee (₹)</p>
            <p className="font-mono font-medium">₹{formatMoney(project.totalFee, 6)}</p>
          </div>
        </div>
      </div>

      {/* Staff Assignments */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
          <Users className="h-4 w-4 text-zinc-500" />
          <h4 className="text-sm font-semibold text-zinc-800">
            Staff Assignments ({project.assignments?.length ?? 0})
          </h4>
        </div>
        {!project.assignments || project.assignments.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No staff assigned to this project.</p>
        ) : (
          <div className="mt-3 divide-y divide-zinc-100 text-sm">
            {project.assignments.map((a, idx) => (
              <div key={idx} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-medium text-zinc-900">{a.staff?.name ?? "—"}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    ({a.role.toLowerCase().replace(/_/g, " ")})
                  </span>
                </div>
                <span className="font-mono text-xs text-zinc-600">
                  {a.allocation != null ? `Allocation: ${Number(a.allocation).toFixed(2)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fee Stages */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
          <Layers className="h-4 w-4 text-zinc-500" />
          <h4 className="text-sm font-semibold text-zinc-800">
            Fee Stages ({project.feeStages?.length ?? 0})
          </h4>
        </div>
        {!project.feeStages || project.feeStages.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No fee stages configured for this project.</p>
        ) : (
          <div className="mt-3 divide-y divide-zinc-100 text-sm">
            {project.feeStages.map((s, idx) => (
              <div key={idx} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium text-zinc-900">{s.stageName}</span>
                  {s.dueDate && (
                    <span className="ml-2 text-xs text-zinc-500">
                      Due: {formatDate(s.dueDate)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 font-mono text-xs">
                  {s.percentage != null && (
                    <span className="text-zinc-600">{Number(s.percentage).toFixed(2)}%</span>
                  )}
                  <span className="font-medium text-zinc-900">₹{formatMoney(s.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

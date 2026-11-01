"use client";

import { useEffect, useMemo, useState } from "react";
import { ProjectStatus } from "@prisma/client";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format-money";
import type { FundFlowWithComputed } from "@/types/fund-flow";
import { ProjectForm } from "@/app/dashboard/fund-flow/project-form";
import { ProjectSummaryView } from "./project-summary-view";
import { Plus, Pencil, Eye } from "lucide-react";

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

interface ProjectsTableProps {
  projects: FundFlowWithComputed[];
  canManage: boolean;
  initialEditProjectId?: string;
}

export function ProjectsTable({
  projects,
  canManage,
  initialEditProjectId,
}: ProjectsTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedProject, setSelectedProject] =
    useState<FundFlowWithComputed | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!initialEditProjectId) return;
    const match = projects.find((p) => p.id === initialEditProjectId);
    if (match) {
      setSelectedProject(match);
    }
  }, [initialEditProjectId, projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.abbreviation?.toLowerCase() ?? "").includes(q) ||
        (p.client?.name.toLowerCase() ?? "").includes(q) ||
        (p.region?.name.toLowerCase() ?? "").includes(q) ||
        (p.workType?.toLowerCase() ?? "").includes(q) ||
        (p.serviceType?.toLowerCase() ?? "").includes(q)
      );
    });
  }, [projects, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="Search projects, client, region, abbreviation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v ?? "ALL")}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {Object.values(ProjectStatus).map((s) => (
                <SelectItem key={s} value={s}>
                  {s.toLowerCase().replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New project
          </Button>
        )}
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[60vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Project</TableHead>
                <TableHead className="whitespace-nowrap">Client</TableHead>
                <TableHead className="whitespace-nowrap">Region</TableHead>
                <TableHead className="whitespace-nowrap">Work / Service</TableHead>
                <TableHead className="whitespace-nowrap">Work Order</TableHead>
                <TableHead className="whitespace-nowrap text-right">Time Limit (Mo)</TableHead>
                <TableHead className="whitespace-nowrap text-right">Estimated Cost</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-zinc-500">
                    No projects found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((project) => (
                  <TableRow
                    key={project.id}
                    onClick={() => setSelectedProject(project)}
                    className="cursor-pointer hover:bg-zinc-50/70 transition-colors"
                  >
                    <TableCell className="font-medium text-zinc-900">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[16rem]" title={project.name}>
                          {project.name}
                        </span>
                        {project.abbreviation && (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                            {project.abbreviation}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {project.client?.name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {project.region?.name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-zinc-600">
                      {[project.workType, project.serviceType].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(project.workOrderDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono">
                      {formatMonths(project.targetTimeLimitMonths ?? project.timeLimitMonths)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono">
                      {formatMoney(project.estimatedCost)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={statusVariantMap[project.status]}
                      >
                        {project.status.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProject(project);
                        }}
                        title={canManage ? "Edit project" : "View project"}
                      >
                        {canManage ? (
                          <>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </>
                        ) : (
                          <>
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            View
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {createOpen && canManage && (
        <ProjectForm
          mode="create"
          onClose={() => setCreateOpen(false)}
        />
      )}

      {selectedProject &&
        (canManage ? (
          <ProjectForm
            project={selectedProject}
            mode="edit"
            onClose={() => setSelectedProject(null)}
          />
        ) : (
          <Dialog open onOpenChange={(open) => !open && setSelectedProject(null)}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>{selectedProject.name}</DialogTitle>
                <DialogDescription>
                  Read-only project details, staff assignments, and fee stages.
                </DialogDescription>
              </DialogHeader>
              <ProjectSummaryView project={selectedProject} />
            </DialogContent>
          </Dialog>
        ))}
    </div>
  );
}

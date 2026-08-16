"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ProjectStatus,
  ProjectRole,
} from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { createProject, updateProject } from "@/lib/actions/project";
import { getRegions } from "@/lib/actions/region";
import { getClients } from "@/lib/actions/client";
import { getStaff } from "@/lib/actions/staff";
import { FundFlowWithComputed } from "@/types/fund-flow";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface ProjectFormProps {
  project?: FundFlowWithComputed;
  mode: "create" | "edit";
  onClose: () => void;
}

interface MasterData {
  regions: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  staff: { id: string; name: string | null }[];
}

interface AssignmentRow {
  staffId: string;
  role: ProjectRole;
  allocation: string;
}

interface FeeStageRow {
  stageName: string;
  percentage: string;
  amount: string;
  dueDate: string;
}

function toInputDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMoneyString(value: unknown): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function toMonthsString(value: unknown): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

function getInitialForm(project?: FundFlowWithComputed) {
  if (!project) {
    return {
      regionId: "",
      clientId: "",
      name: "",
      abbreviation: "",
      address: "",
      agreementDate: "",
      workOrderDate: "",
      timeLimitMonths: "",
      additionalTimeMonths: "",
      targetTimeLimitMonths: "",
      stipulatedCompletionDate: "",
      targetCompletionDate: "",
      estimatedCost: "",
      totalFee: "",
      status: ProjectStatus.ACTIVE,
      workType: "",
      serviceType: "",
    };
  }
  return {
    regionId: project.regionId,
    clientId: project.clientId,
    name: project.name,
    abbreviation: project.abbreviation ?? "",
    address: project.address ?? "",
    agreementDate: toInputDate(project.agreementDate),
    workOrderDate: toInputDate(project.workOrderDate),
    timeLimitMonths: toMonthsString(project.timeLimitMonths),
    additionalTimeMonths: toMonthsString(project.additionalTimeMonths),
    targetTimeLimitMonths: toMonthsString(project.targetTimeLimitMonths),
    stipulatedCompletionDate: toInputDate(project.stipulatedCompletionDate),
    targetCompletionDate: toInputDate(project.targetCompletionDate),
    estimatedCost: toMoneyString(project.estimatedCost),
    totalFee: toMoneyString(project.totalFee),
    status: project.status,
    workType: project.workType,
    serviceType: project.serviceType,
  };
}

function getInitialAssignments(project?: FundFlowWithComputed): AssignmentRow[] {
  if (!project) return [];
  return project.assignments.map((a) => ({
    staffId: a.staff.id,
    role: a.role as ProjectRole,
    allocation: a.allocation ? Number(a.allocation).toFixed(2) : "",
  }));
}

function getInitialFeeStages(project?: FundFlowWithComputed): FeeStageRow[] {
  if (!project) return [];
  return project.feeStages.map((s) => ({
    stageName: s.stageName,
    percentage: s.percentage ? Number(s.percentage).toFixed(2) : "",
    amount: toMoneyString(s.amount),
    dueDate: toInputDate(s.dueDate),
  }));
}

export function ProjectForm({ project, mode, onClose }: ProjectFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [master, setMaster] = useState<MasterData>({
    regions: [],
    clients: [],
    staff: [],
  });
  const [masterLoading, setMasterLoading] = useState(true);

  const [form, setForm] = useState(() => getInitialForm(project));
  const [assignments, setAssignments] = useState(() =>
    getInitialAssignments(project)
  );
  const [feeStages, setFeeStages] = useState(() => getInitialFeeStages(project));
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    async function load() {
      const [regionsRes, clientsRes, staffRes] = await Promise.all([
        getRegions(),
        getClients(),
        getStaff(),
      ]);
      setMaster({
        regions: (regionsRes.data ?? []) as { id: string; name: string }[],
        clients: (clientsRes.data ?? []) as { id: string; name: string }[],
        staff: (staffRes.data ?? []) as { id: string; name: string | null }[],
      });
      setMasterLoading(false);
    }
    load();
  }, []);

  const open = true;

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleNumberInput(
    key: "timeLimitMonths" | "additionalTimeMonths" | "targetTimeLimitMonths",
    value: string
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addAssignment() {
    setAssignments((prev) => [
      ...prev,
      {
        staffId: master.staff[0]?.id ?? "",
        role: ProjectRole.TEAM_LEADER,
        allocation: "",
      },
    ]);
  }

  function updateAssignment(index: number, patch: Partial<AssignmentRow>) {
    setAssignments((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function removeAssignment(index: number) {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  }

  function addFeeStage() {
    setFeeStages((prev) => [
      ...prev,
      { stageName: "", percentage: "", amount: "", dueDate: "" },
    ]);
  }

  function updateFeeStage(index: number, patch: Partial<FeeStageRow>) {
    setFeeStages((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function removeFeeStage(index: number) {
    setFeeStages((prev) => prev.filter((_, i) => i !== index));
  }

  function buildPayload() {
    const base = {
      name: form.name.trim(),
      clientId: form.clientId,
      abbreviation: emptyToNull(form.abbreviation),
      address: emptyToNull(form.address),
      agreementDate: form.agreementDate || null,
      workOrderDate: form.workOrderDate || null,
      timeLimitMonths: form.timeLimitMonths || undefined,
      additionalTimeMonths: form.additionalTimeMonths || null,
      targetTimeLimitMonths: form.targetTimeLimitMonths || null,
      stipulatedCompletionDate: form.stipulatedCompletionDate || null,
      targetCompletionDate: form.targetCompletionDate || null,
      estimatedCost: form.estimatedCost || undefined,
      totalFee: form.totalFee || undefined,
      status: form.status,
      workType: form.workType,
      serviceType: form.serviceType,
      assignments:
        assignments.length > 0
          ? assignments
              .filter((a) => a.staffId && a.role)
              .map((a) => ({
                staffId: a.staffId,
                role: a.role,
                allocation: a.allocation ? Number(a.allocation) : null,
              }))
          : undefined,
      feeStages:
        feeStages.length > 0
          ? feeStages
              .filter((s) => s.stageName.trim())
              .map((s) => ({
                stageName: s.stageName.trim(),
                percentage: s.percentage ? Number(s.percentage) : null,
                amount: s.amount || undefined,
                dueDate: s.dueDate || null,
              }))
          : undefined,
    };

    if (isEdit) {
      return { id: project!.id, ...base };
    }
    return { ...base, regionId: form.regionId };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = buildPayload();
      const result = isEdit
        ? await updateProject(
            payload as unknown as Parameters<typeof updateProject>[0]
          )
        : await createProject(
            payload as unknown as Parameters<typeof createProject>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save project.");
        toast.error(result.error ?? "Failed to save project.");
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
      return;
    } finally {
      setSubmitting(false);
    }

    toast.success(mode === "create" ? "Project created successfully" : "Project updated successfully");
    router.refresh();
    onClose();
  }

  const title = isEdit ? "Edit project" : "New project";
  const description = isEdit
    ? "Update project details, staff assignments, and fee stages."
    : "Create a new project to start tracking fund flow.";

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {masterLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col overflow-hidden"
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v ?? "details")}
              className="flex-1 overflow-hidden"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="staff">Staff</TabsTrigger>
                <TabsTrigger value="fees">Fee Stages</TabsTrigger>
              </TabsList>

              <TabsContent
                value="details"
                className="max-h-[55vh] overflow-y-auto py-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {!isEdit && (
                    <div className="space-y-1.5">
                      <Label htmlFor="region">Region</Label>
                      <Select
                        value={form.regionId}
                        onValueChange={(v) => updateField("regionId", v ?? "")}
                      >
                        <SelectTrigger id="region">
                          <SelectValue placeholder="Select region">
                            {(value: string) => master.regions.find((r) => r.id === value)?.name ?? "Select region"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {master.regions.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="client">Client</Label>
                      <a
                        href="/dashboard/clients"
                        target="_blank"
                        className="text-[10px] text-zinc-500 hover:text-zinc-900 hover:underline"
                      >
                        Manage clients →
                      </a>
                    </div>
                    <Select
                      value={form.clientId}
                      onValueChange={(v) => updateField("clientId", v ?? "")}
                    >
                      <SelectTrigger id="client">
                        <SelectValue placeholder="Select client">
                          {(value: string) => master.clients.find((c) => c.id === value)?.name ?? "Select client"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {master.clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="name">Project name</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="abbreviation">Abbreviation</Label>
                    <Input
                      id="abbreviation"
                      value={form.abbreviation}
                      onChange={(e) =>
                        updateField("abbreviation", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) =>
                        updateField("status", v as ProjectStatus)
                      }
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ProjectStatus).map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.toLowerCase().replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="workType">Work type</Label>
                    <Input
                      id="workType"
                      value={form.workType}
                      onChange={(e) => updateField("workType", e.target.value)}
                      placeholder="e.g. Building, Road, Water"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="serviceType">Service type (PMC / TPI)</Label>
                      <div className="flex flex-wrap gap-1">
                        {["PMC", "TPI", "EPC", "Consultancy"].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateField("serviceType", t)}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                              form.serviceType === t
                                ? "bg-zinc-900 text-white border-zinc-900"
                                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border-zinc-200"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Input
                      id="serviceType"
                      value={form.serviceType}
                      onChange={(e) => updateField("serviceType", e.target.value)}
                      placeholder="e.g. PMC, TPI"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="workOrderDate">Work order date</Label>
                    <Input
                      id="workOrderDate"
                      type="date"
                      value={form.workOrderDate}
                      onChange={(e) =>
                        updateField("workOrderDate", e.target.value)
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="agreementDate">Agreement date</Label>
                    <Input
                      id="agreementDate"
                      type="date"
                      value={form.agreementDate}
                      onChange={(e) =>
                        updateField("agreementDate", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="timeLimitMonths">
                      Time limit (months)
                    </Label>
                    <Input
                      id="timeLimitMonths"
                      type="number"
                      step="0.01"
                      value={form.timeLimitMonths}
                      onChange={(e) =>
                        handleNumberInput("timeLimitMonths", e.target.value)
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="additionalTimeMonths">
                      Additional time (months)
                    </Label>
                    <Input
                      id="additionalTimeMonths"
                      type="number"
                      step="0.01"
                      value={form.additionalTimeMonths}
                      onChange={(e) =>
                        handleNumberInput("additionalTimeMonths", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="targetTimeLimitMonths">
                      Target time limit (months)
                    </Label>
                    <Input
                      id="targetTimeLimitMonths"
                      type="number"
                      step="0.01"
                      value={form.targetTimeLimitMonths}
                      onChange={(e) =>
                        handleNumberInput(
                          "targetTimeLimitMonths",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="stipulatedCompletionDate">
                      Stipulated completion
                    </Label>
                    <Input
                      id="stipulatedCompletionDate"
                      type="date"
                      value={form.stipulatedCompletionDate}
                      onChange={(e) =>
                        updateField("stipulatedCompletionDate", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="targetCompletionDate">
                      Target completion
                    </Label>
                    <Input
                      id="targetCompletionDate"
                      type="date"
                      value={form.targetCompletionDate}
                      onChange={(e) =>
                        updateField("targetCompletionDate", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="estimatedCost">Estimated cost (₹)</Label>
                    <Input
                      id="estimatedCost"
                      type="number"
                      step="0.01"
                      value={form.estimatedCost}
                      onChange={(e) =>
                        updateField("estimatedCost", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="totalFee">Total fee (₹)</Label>
                    <Input
                      id="totalFee"
                      type="number"
                      step="0.01"
                      value={form.totalFee}
                      onChange={(e) => updateField("totalFee", e.target.value)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="staff"
                className="max-h-[55vh] overflow-y-auto py-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Staff assignments</h4>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addAssignment}
                      disabled={master.staff.length === 0}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add assignment
                    </Button>
                  </div>

                  {assignments.length === 0 && (
                    <p className="text-sm text-zinc-500">
                      No assignments yet. Click &quot;Add assignment&quot; to define project roles.
                    </p>
                  )}

                  {assignments.map((row, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr,1fr,auto,auto] items-end gap-2"
                    >
                      <div className="space-y-1.5">
                        <Label className="text-xs">Staff</Label>
                        <Select
                          value={row.staffId}
                          onValueChange={(v) =>
                            updateAssignment(index, { staffId: v ?? "" })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select staff">
                              {(value: string) => master.staff.find((s) => s.id === value)?.name ?? "Select staff"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {master.staff.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name ?? s.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Role</Label>
                        <Select
                          value={row.role}
                          onValueChange={(v) =>
                            updateAssignment(index, { role: v as ProjectRole })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(ProjectRole).map((r) => (
                              <SelectItem key={r} value={r}>
                                {r.toLowerCase().replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Allocation</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={row.allocation}
                          onChange={(e) =>
                            updateAssignment(index, { allocation: e.target.value })
                          }
                          placeholder="0–1"
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeAssignment(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent
                value="fees"
                className="max-h-[55vh] overflow-y-auto py-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Fee stages</h4>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addFeeStage}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add stage
                    </Button>
                  </div>

                  {feeStages.length === 0 && (
                    <p className="text-sm text-zinc-500">
                      No fee stages yet. Click &quot;Add stage&quot; to define billing milestones.
                    </p>
                  )}

                  {feeStages.map((row, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr,auto,auto,auto,auto] items-end gap-2"
                    >
                      <div className="space-y-1.5">
                        <Label className="text-xs">Stage name</Label>
                        <Input
                          value={row.stageName}
                          onChange={(e) =>
                            updateFeeStage(index, { stageName: e.target.value })
                          }
                          placeholder="e.g. Mobilization"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">%</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          className="w-20"
                          value={row.percentage}
                          onChange={(e) =>
                            updateFeeStage(index, { percentage: e.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Amount (₹)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-28"
                          value={row.amount}
                          onChange={(e) =>
                            updateFeeStage(index, { amount: e.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Due date</Label>
                        <Input
                          type="date"
                          value={row.dueDate}
                          onChange={(e) =>
                            updateFeeStage(index, { dueDate: e.target.value })
                          }
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeFeeStage(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <Separator className="my-4" />

            <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating project" : "Editing project")} askingAi={askingAi} aiResponse={aiResponse} />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {isEdit ? "Save changes" : "Create project"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

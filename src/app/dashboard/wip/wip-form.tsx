"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WipCoordinatorLevel, WipStatus } from "@prisma/client";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { createWip, updateWip } from "@/lib/actions/wip";
import { WipWithComputed } from "@/types/wip";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface WipFormProps {
  wip?: WipWithComputed;
  mode: "create" | "edit";
  projects: { id: string; name: string }[];
  staff: { id: string; name: string | null }[];
  onClose: () => void;
}

interface AssignmentRow {
  staffId: string;
  level: WipCoordinatorLevel;
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

function getInitialForm(wip?: WipWithComputed, projectId?: string) {
  if (!wip) {
    return {
      projectId: projectId ?? "",
      status: WipStatus.NOT_STARTED,
      loiReceiptDate: "",
      agreementDate: "",
      workOrderDate: "",
      timeLimitMonths: "",
      stipulatedCompletionDate: "",
      targetCompletionDate: "",
      hoCoordinatorId: "",
      roCoordinatorId: "",
      securityDepositAmount: "",
      securityDepositStatus: "",
      securityDepositReturnDate: "",
      amountOfWorkDone: "",
      finalProgressAmount: "",
      raBill1Amount: "",
      raBill1Date: "",
      raBill1SaecFee: "",
      raBill1ProjectExpense: "",
      raBill2Amount: "",
      raBill2Date: "",
      raBill2SaecFee: "",
      raBill2ProjectExpense: "",
      raBill3Amount: "",
      raBill3Date: "",
      raBill3SaecFee: "",
      raBill3ProjectExpense: "",
      raBill4Amount: "",
      raBill4Date: "",
      raBill4SaecFee: "",
      raBill4ProjectExpense: "",
      annexure3aPath: "",
      completionCertificatePath: "",
      completionDate: "",
      remarks: "",
    };
  }
  return {
    projectId: wip.projectId,
    status: wip.status,
    loiReceiptDate: toInputDate(wip.loiReceiptDate),
    agreementDate: toInputDate(wip.agreementDate),
    workOrderDate: toInputDate(wip.workOrderDate),
    timeLimitMonths: toMonthsString(wip.timeLimitMonths),
    stipulatedCompletionDate: toInputDate(wip.stipulatedCompletionDate),
    targetCompletionDate: toInputDate(wip.targetCompletionDate),
    hoCoordinatorId: wip.hoCoordinatorId ?? "",
    roCoordinatorId: wip.roCoordinatorId ?? "",
    securityDepositAmount: toMoneyString(wip.securityDepositAmount),
    securityDepositStatus: wip.securityDepositStatus ?? "",
    securityDepositReturnDate: toInputDate(wip.securityDepositReturnDate),
    amountOfWorkDone: toMoneyString(wip.amountOfWorkDone),
    finalProgressAmount: toMoneyString(wip.finalProgressAmount),
    raBill1Amount: toMoneyString(wip.raBill1Amount),
    raBill1Date: toInputDate(wip.raBill1Date),
    raBill1SaecFee: toMoneyString(wip.raBill1SaecFee),
    raBill1ProjectExpense: toMoneyString(wip.raBill1ProjectExpense),
    raBill2Amount: toMoneyString(wip.raBill2Amount),
    raBill2Date: toInputDate(wip.raBill2Date),
    raBill2SaecFee: toMoneyString(wip.raBill2SaecFee),
    raBill2ProjectExpense: toMoneyString(wip.raBill2ProjectExpense),
    raBill3Amount: toMoneyString(wip.raBill3Amount),
    raBill3Date: toInputDate(wip.raBill3Date),
    raBill3SaecFee: toMoneyString(wip.raBill3SaecFee),
    raBill3ProjectExpense: toMoneyString(wip.raBill3ProjectExpense),
    raBill4Amount: toMoneyString(wip.raBill4Amount),
    raBill4Date: toInputDate(wip.raBill4Date),
    raBill4SaecFee: toMoneyString(wip.raBill4SaecFee),
    raBill4ProjectExpense: toMoneyString(wip.raBill4ProjectExpense),
    annexure3aPath: wip.annexure3aPath ?? "",
    completionCertificatePath: wip.completionCertificatePath ?? "",
    completionDate: toInputDate(wip.completionDate),
    remarks: wip.remarks ?? "",
  };
}

function getInitialAssignments(wip?: WipWithComputed): AssignmentRow[] {
  if (!wip) return [];
  return wip.assignments.map((a) => ({
    staffId: a.staff.id,
    level: a.level as WipCoordinatorLevel,
  }));
}

export function WipForm({ wip, mode, projects, staff, onClose }: WipFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(wip));
  const [assignments, setAssignments] = useState(() =>
    getInitialAssignments(wip)
  );
  const [activeTab, setActiveTab] = useState("details");
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

  const totals = useMemo(() => {
    const raAmounts = [
      form.raBill1Amount,
      form.raBill2Amount,
      form.raBill3Amount,
      form.raBill4Amount,
    ].map((v) => Number(v) || 0);
    const saecFees = [
      form.raBill1SaecFee,
      form.raBill2SaecFee,
      form.raBill3SaecFee,
      form.raBill4SaecFee,
    ].map((v) => Number(v) || 0);
    const expenses = [
      form.raBill1ProjectExpense,
      form.raBill2ProjectExpense,
      form.raBill3ProjectExpense,
      form.raBill4ProjectExpense,
    ].map((v) => Number(v) || 0);

    const totalRa = raAmounts.reduce((a, b) => a + b, 0);
    const totalSaecFee = saecFees.reduce((a, b) => a + b, 0);
    const totalExpense = expenses.reduce((a, b) => a + b, 0);
    const workDone = Number(form.amountOfWorkDone) || 0;
    const balance = Math.max(0, workDone - totalRa);

    return { totalRa, totalSaecFee, totalExpense, balance };
  }, [form]);

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addAssignment() {
    setAssignments((prev) => [
      ...prev,
      {
        staffId: staff[0]?.id ?? "",
        level: WipCoordinatorLevel.L1,
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

  function buildPayload() {
    const base = {
      status: form.status,
      loiReceiptDate: form.loiReceiptDate || null,
      agreementDate: form.agreementDate || null,
      workOrderDate: form.workOrderDate || null,
      timeLimitMonths: form.timeLimitMonths || null,
      stipulatedCompletionDate: form.stipulatedCompletionDate || null,
      targetCompletionDate: form.targetCompletionDate || null,
      hoCoordinatorId: form.hoCoordinatorId || null,
      roCoordinatorId: form.roCoordinatorId || null,
      securityDepositAmount: form.securityDepositAmount || null,
      securityDepositStatus: emptyToNull(form.securityDepositStatus),
      securityDepositReturnDate: form.securityDepositReturnDate || null,
      amountOfWorkDone: form.amountOfWorkDone || null,
      finalProgressAmount: form.finalProgressAmount || null,
      raBill1Amount: form.raBill1Amount || null,
      raBill1Date: form.raBill1Date || null,
      raBill1SaecFee: form.raBill1SaecFee || null,
      raBill1ProjectExpense: form.raBill1ProjectExpense || null,
      raBill2Amount: form.raBill2Amount || null,
      raBill2Date: form.raBill2Date || null,
      raBill2SaecFee: form.raBill2SaecFee || null,
      raBill2ProjectExpense: form.raBill2ProjectExpense || null,
      raBill3Amount: form.raBill3Amount || null,
      raBill3Date: form.raBill3Date || null,
      raBill3SaecFee: form.raBill3SaecFee || null,
      raBill3ProjectExpense: form.raBill3ProjectExpense || null,
      raBill4Amount: form.raBill4Amount || null,
      raBill4Date: form.raBill4Date || null,
      raBill4SaecFee: form.raBill4SaecFee || null,
      raBill4ProjectExpense: form.raBill4ProjectExpense || null,
      annexure3aPath: emptyToNull(form.annexure3aPath),
      completionCertificatePath: emptyToNull(form.completionCertificatePath),
      completionDate: form.completionDate || null,
      remarks: emptyToNull(form.remarks),
      assignments:
        assignments.length > 0
          ? assignments
              .filter((a) => a.staffId && a.level)
              .map((a) => ({ staffId: a.staffId, level: a.level }))
          : undefined,
    };

    if (isEdit) {
      return { id: wip!.id, ...base };
    }
    return { ...base, projectId: form.projectId };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = buildPayload();
      const result = isEdit
        ? await updateWip(
            payload as unknown as Parameters<typeof updateWip>[0]
          )
        : await createWip(
            payload as unknown as Parameters<typeof createWip>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save WIP record.");
        toast.error(result.error ?? "Failed to save WIP record.");
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

    toast.success(mode === "create" ? "WIP record created successfully" : "WIP record updated successfully");
    router.refresh();
    onClose();
  }

  const title = isEdit ? "Edit WIP record" : "New WIP record";
  const description = isEdit
    ? "Update work progress, RA bills, and completion details."
    : "Start tracking work-in-progress for a project.";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col overflow-hidden"
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v ?? "details")}
            className="flex-1 overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="coordinators">Coordinators</TabsTrigger>
              <TabsTrigger value="raBills">RA Bills</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            <TabsContent
              value="details"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {!isEdit && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="project">Project</Label>
                    <Select
                      value={form.projectId}
                      onValueChange={(v) =>
                        updateField("projectId", v ?? "")
                      }
                    >
                      <SelectTrigger id="project">
                        <SelectValue placeholder="Select project">
                          {(value: string) => projects.find((p) => p.id === value)?.name ?? "Select project"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      updateField("status", v as WipStatus)
                    }
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(WipStatus).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.toLowerCase().replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="loiReceiptDate">LOI receipt date</Label>
                  <Input
                    id="loiReceiptDate"
                    type="date"
                    value={form.loiReceiptDate}
                    onChange={(e) =>
                      updateField("loiReceiptDate", e.target.value)
                    }
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
                  <Label htmlFor="workOrderDate">Work order date</Label>
                  <Input
                    id="workOrderDate"
                    type="date"
                    value={form.workOrderDate}
                    onChange={(e) =>
                      updateField("workOrderDate", e.target.value)
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
                      updateField("timeLimitMonths", e.target.value)
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

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="securityDepositStatus">
                    Security deposit status
                  </Label>
                  <Input
                    id="securityDepositStatus"
                    value={form.securityDepositStatus}
                    onChange={(e) =>
                      updateField("securityDepositStatus", e.target.value)
                    }
                    placeholder="e.g. SUBMITTED / RETURNED / FORFEITED"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="securityDepositAmount">
                    Security deposit amount (₹)
                  </Label>
                  <Input
                    id="securityDepositAmount"
                    type="number"
                    step="0.01"
                    value={form.securityDepositAmount}
                    onChange={(e) =>
                      updateField("securityDepositAmount", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="securityDepositReturnDate">
                    Security deposit return date
                  </Label>
                  <Input
                    id="securityDepositReturnDate"
                    type="date"
                    value={form.securityDepositReturnDate}
                    onChange={(e) =>
                      updateField("securityDepositReturnDate", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="amountOfWorkDone">
                    Amount of work done (₹)
                  </Label>
                  <Input
                    id="amountOfWorkDone"
                    type="number"
                    step="0.01"
                    value={form.amountOfWorkDone}
                    onChange={(e) =>
                      updateField("amountOfWorkDone", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="finalProgressAmount">
                    Final progress amount (₹)
                  </Label>
                  <Input
                    id="finalProgressAmount"
                    type="number"
                    step="0.01"
                    value={form.finalProgressAmount}
                    onChange={(e) =>
                      updateField("finalProgressAmount", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="remarks">Remarks</Label>
                  <Textarea
                    id="remarks"
                    value={form.remarks}
                    onChange={(e) => updateField("remarks", e.target.value)}
                    placeholder="Status notes or progress remarks…"
                    className="min-h-16"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="coordinators"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="hoCoordinatorId">HO coordinator</Label>
                  <Select
                    value={form.hoCoordinatorId}
                    onValueChange={(v) =>
                      updateField("hoCoordinatorId", v ?? "")
                    }
                  >
                    <SelectTrigger id="hoCoordinatorId">
                      <SelectValue placeholder="Select staff">
                        {(value: string) => value ? staff.find((s) => s.id === value)?.name ?? "Select staff" : "Select staff"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name ?? s.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="roCoordinatorId">RO coordinator</Label>
                  <Select
                    value={form.roCoordinatorId}
                    onValueChange={(v) =>
                      updateField("roCoordinatorId", v ?? "")
                    }
                  >
                    <SelectTrigger id="roCoordinatorId">
                      <SelectValue placeholder="Select staff">
                        {(value: string) => value ? staff.find((s) => s.id === value)?.name ?? "Select staff" : "Select staff"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name ?? s.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Level assignments</h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addAssignment}
                    disabled={staff.length === 0}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add assignment
                  </Button>
                </div>

                {assignments.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    No level assignments yet. Click &quot;Add assignment&quot; to assign L1–L4 staff.
                  </p>
                )}

                {assignments.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr,auto,auto] items-end gap-2"
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
                            {(value: string) => staff.find((s) => s.id === value)?.name ?? "Select staff"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {staff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name ?? s.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Level</Label>
                      <Select
                        value={row.level}
                        onValueChange={(v) =>
                          updateAssignment(index, {
                            level: v as WipCoordinatorLevel,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(WipCoordinatorLevel).map((l) => (
                            <SelectItem key={l} value={l}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
              value="raBills"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="space-y-6">
                {[1, 2, 3, 4].map((n) => {
                  const amountKey = `raBill${n}Amount` as keyof typeof form;
                  const dateKey = `raBill${n}Date` as keyof typeof form;
                  const feeKey = `raBill${n}SaecFee` as keyof typeof form;
                  const expenseKey =
                    `raBill${n}ProjectExpense` as keyof typeof form;

                  return (
                    <div key={n} className="space-y-3">
                      <h4 className="text-sm font-medium">
                        RA Bill {n}
                      </h4>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Amount (₹)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={form[amountKey]}
                            onChange={(e) =>
                              updateField(amountKey, e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Date</Label>
                          <Input
                            type="date"
                            value={form[dateKey]}
                            onChange={(e) =>
                              updateField(dateKey, e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">SAEC fee (₹)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={form[feeKey]}
                            onChange={(e) =>
                              updateField(feeKey, e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Project exp (₹)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={form[expenseKey]}
                            onChange={(e) =>
                              updateField(expenseKey, e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <Separator />

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                  <div className="rounded-md bg-zinc-50 p-3">
                    <p className="text-xs text-zinc-500">Total RA amount</p>
                    <p className="font-mono font-medium">
                      ₹{totals.totalRa.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-3">
                    <p className="text-xs text-zinc-500">Total SAEC fee</p>
                    <p className="font-mono font-medium">
                      ₹{totals.totalSaecFee.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-3">
                    <p className="text-xs text-zinc-500">Total project exp</p>
                    <p className="font-mono font-medium">
                      ₹{totals.totalExpense.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-3">
                    <p className="text-xs text-zinc-500">Balance work</p>
                    <p className="font-mono font-medium">
                      ₹{totals.balance.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="documents"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FileUploadField
                    id="wip"
                    label="Annexure 3A document"
                    value={form.annexure3aPath}
                    onChange={(v) => updateField("annexure3aPath", v)}
                    placeholder="Upload Annexure 3A or enter path"
                  />
                </div>

                <div className="space-y-1.5">
                  <FileUploadField
                    id="wip"
                    label="Completion certificate"
                    value={form.completionCertificatePath}
                    onChange={(v) => updateField("completionCertificatePath", v)}
                    placeholder="Upload completion certificate or enter path"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="completionDate">Completion date</Label>
                  <Input
                    id="completionDate"
                    type="date"
                    value={form.completionDate}
                    onChange={(e) =>
                      updateField("completionDate", e.target.value)
                    }
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating WIP record" : "Editing WIP record")} askingAi={askingAi} aiResponse={aiResponse} />

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
              {isEdit ? "Save changes" : "Create WIP record"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

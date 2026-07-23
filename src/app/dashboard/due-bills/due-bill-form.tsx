"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DueBillStatus, DueBillWithComputed } from "@/types/due-bills";
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
import { Separator } from "@/components/ui/separator";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { createDueBill, updateDueBill } from "@/lib/actions/due-bill";
import { Loader2 } from "lucide-react";

interface DueBillFormProps {
  bill?: DueBillWithComputed;
  mode: "create" | "edit";
  projects: { id: string; name: string }[];
  onClose: () => void;
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

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

function getInitialForm(bill?: DueBillWithComputed, projectId?: string) {
  if (!bill) {
    return {
      projectId: projectId ?? "",
      scheme: "",
      grossAmount: "",
      sgst: "",
      cgst: "",
      chequeAmount: "",
      sd: "",
      itTds: "",
      billDate: "",
      receiveDate: "",
      status: DueBillStatus.PENDING,
      remarks: "",
      billCopyPath: "",
    };
  }
  return {
    projectId: bill.projectId,
    scheme: bill.scheme,
    grossAmount: toMoneyString(bill.grossAmount),
    sgst: toMoneyString(bill.sgst),
    cgst: toMoneyString(bill.cgst),
    chequeAmount: toMoneyString(bill.chequeAmount),
    sd: toMoneyString(bill.sd),
    itTds: toMoneyString(bill.itTds),
    billDate: toInputDate(bill.billDate),
    receiveDate: toInputDate(bill.receiveDate),
    status: bill.status,
    remarks: bill.remarks ?? "",
    billCopyPath: bill.billCopyPath ?? "",
  };
}

export function DueBillForm({ bill, mode, projects, onClose }: DueBillFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(bill));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billAmount = useMemo(() => {
    const gross = Number(form.grossAmount) || 0;
    const sgst = Number(form.sgst) || 0;
    const cgst = Number(form.cgst) || 0;
    return gross + sgst + cgst;
  }, [form.grossAmount, form.sgst, form.cgst]);

  const receivedAmount = useMemo(() => {
    const cheque = Number(form.chequeAmount) || 0;
    const sd = Number(form.sd) || 0;
    const itTds = Number(form.itTds) || 0;
    return cheque + sd + itTds;
  }, [form.chequeAmount, form.sd, form.itTds]);

  const pendingAmount = useMemo(() => {
    return Math.max(0, billAmount - receivedAmount);
  }, [billAmount, receivedAmount]);

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload() {
    const base = {
      scheme: form.scheme.trim(),
      grossAmount: form.grossAmount || undefined,
      sgst: form.sgst || undefined,
      cgst: form.cgst || undefined,
      chequeAmount: form.chequeAmount || undefined,
      sd: form.sd || undefined,
      itTds: form.itTds || undefined,
      billDate: form.billDate || null,
      receiveDate: form.receiveDate || null,
      status: form.status,
      remarks: emptyToNull(form.remarks),
      billCopyPath: emptyToNull(form.billCopyPath),
    };

    if (isEdit) {
      return { id: bill!.id, ...base };
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
        ? await updateDueBill(
            payload as unknown as Parameters<typeof updateDueBill>[0]
          )
        : await createDueBill(
            payload as unknown as Parameters<typeof createDueBill>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save bill.");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      return;
    } finally {
      setSubmitting(false);
    }

    router.refresh();
    onClose();
  }

  const title = isEdit ? "Edit bill" : "New bill";
  const description = isEdit
    ? "Update billing and receipt details."
    : "Add a new bill against a project.";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="project">Project</Label>
              <Select
                value={form.projectId}
                onValueChange={(v) => updateField("projectId", v ?? "")}
              >
                <SelectTrigger id="project">
                  <SelectValue placeholder="Select project" />
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="scheme">Scheme</Label>
              <Input
                id="scheme"
                value={form.scheme}
                onChange={(e) => updateField("scheme", e.target.value)}
                placeholder="e.g. 1st RA"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => updateField("status", v as DueBillStatus)}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DueBillStatus).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.toLowerCase().replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="billDate">Bill date</Label>
              <Input
                id="billDate"
                type="date"
                value={form.billDate}
                onChange={(e) => updateField("billDate", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="receiveDate">Receive date</Label>
              <Input
                id="receiveDate"
                type="date"
                value={form.receiveDate}
                onChange={(e) => updateField("receiveDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="grossAmount">Gross (₹)</Label>
              <Input
                id="grossAmount"
                type="number"
                step="0.01"
                value={form.grossAmount}
                onChange={(e) => updateField("grossAmount", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sgst">SGST (₹)</Label>
              <Input
                id="sgst"
                type="number"
                step="0.01"
                value={form.sgst}
                onChange={(e) => updateField("sgst", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cgst">CGST (₹)</Label>
              <Input
                id="cgst"
                type="number"
                step="0.01"
                value={form.cgst}
                onChange={(e) => updateField("cgst", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="chequeAmount">Cheque (₹)</Label>
              <Input
                id="chequeAmount"
                type="number"
                step="0.01"
                value={form.chequeAmount}
                onChange={(e) => updateField("chequeAmount", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sd">SD (₹)</Label>
              <Input
                id="sd"
                type="number"
                step="0.01"
                value={form.sd}
                onChange={(e) => updateField("sd", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="itTds">IT / TDS (₹)</Label>
              <Input
                id="itTds"
                type="number"
                step="0.01"
                value={form.itTds}
                onChange={(e) => updateField("itTds", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea
              id="remarks"
              value={form.remarks}
              onChange={(e) => updateField("remarks", e.target.value)}
              placeholder="Status notes or deduction details…"
              className="min-h-16"
            />
          </div>

          <FileUploadField
            id="due-bills"
            label="Bill copy / document"
            value={form.billCopyPath}
            onChange={(v) => updateField("billCopyPath", v)}
            placeholder="Upload scanned bill copy or enter path"
          />

          <Separator />

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Bill amount</p>
              <p className="font-mono font-medium">
                ₹{billAmount.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Received</p>
              <p className="font-mono font-medium">
                ₹{receivedAmount.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Pending</p>
              <p className="font-mono font-medium">
                ₹{pendingAmount.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

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
              {isEdit ? "Save changes" : "Create bill"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

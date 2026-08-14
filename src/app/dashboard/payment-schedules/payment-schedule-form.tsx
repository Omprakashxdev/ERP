"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PaymentSchedule,
  PaymentScheduleCategory,
  PaymentScheduleStatus,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPaymentSchedule,
  updatePaymentSchedule,
} from "@/lib/actions/payment-schedule";
import { FileUploadField } from "@/components/ui/file-upload-field";
import type { MasterData } from "@/lib/master-data";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface PaymentScheduleFormProps {
  paymentSchedule?: PaymentSchedule;
  mode: "create" | "edit";
  masters?: MasterData;
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

function getInitialForm(paymentSchedule?: PaymentSchedule) {
  if (!paymentSchedule) {
    return {
      date: toInputDate(new Date()),
      dueDate: "",
      paymentType: "",
      category: PaymentScheduleCategory.GST,
      detail: "",
      amount: "",
      status: PaymentScheduleStatus.PENDING,
      billCopyPath: "",
      remarks: "",
    };
  }
  return {
    date: toInputDate(paymentSchedule.date),
    dueDate: toInputDate(paymentSchedule.dueDate),
    paymentType: paymentSchedule.paymentType ?? "",
    category: paymentSchedule.category,
    detail: paymentSchedule.detail ?? "",
    amount: toMoneyString(paymentSchedule.amount),
    status: paymentSchedule.status,
    billCopyPath: paymentSchedule.billCopyPath ?? "",
    remarks: paymentSchedule.remarks ?? "",
  };
}

export function PaymentScheduleForm({
  paymentSchedule,
  mode,
  masters,
  onClose,
}: PaymentScheduleFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(paymentSchedule));
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload() {
    const base = {
      date: form.date || undefined,
      dueDate: form.dueDate || null,
      paymentType: emptyToNull(form.paymentType),
      category: form.category,
      detail: emptyToNull(form.detail),
      amount: form.amount || null,
      status: form.status,
      billCopyPath: emptyToNull(form.billCopyPath),
      remarks: emptyToNull(form.remarks),
    };

    if (isEdit) {
      return { id: paymentSchedule!.id, ...base };
    }
    return base;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = buildPayload();
      const result = isEdit
        ? await updatePaymentSchedule(
            payload as unknown as Parameters<typeof updatePaymentSchedule>[0]
          )
        : await createPaymentSchedule(
            payload as unknown as Parameters<typeof createPaymentSchedule>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save payment schedule.");
        toast.error(result.error ?? "Failed to save payment schedule.");
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

    toast.success(mode === "create" ? "Payment schedule created successfully" : "Payment schedule updated successfully");
    router.refresh();
    onClose();
  }

  const title = isEdit ? "Edit payment schedule" : "New payment schedule";
  const description = isEdit
    ? "Update scheduled payment details, due date, and status."
    : "Record a scheduled payment and track it through due date.";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => updateField("date", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dueDate">Due date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  min={form.date || undefined}
                  value={form.dueDate}
                  onChange={(e) => updateField("dueDate", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    updateField("category", v as PaymentScheduleCategory)
                  }
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(PaymentScheduleCategory).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.toLowerCase().replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  disabled={!isEdit}
                  onValueChange={(v) =>
                    updateField("status", v as PaymentScheduleStatus)
                  }
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(PaymentScheduleStatus).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.toLowerCase().replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="paymentType">Payment type</Label>
                {masters && masters.paymentTypes.length > 0 ? (
                  <Select
                    value={form.paymentType}
                    onValueChange={(v) => updateField("paymentType", v ?? "")}
                  >
                    <SelectTrigger id="paymentType">
                      <SelectValue placeholder="Select payment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {masters.paymentTypes.map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="paymentType"
                    value={form.paymentType}
                    onChange={(e) => updateField("paymentType", e.target.value)}
                    placeholder="e.g. Scheduled / Due payment"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => updateField("amount", e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="detail">Detail</Label>
                <Input
                  id="detail"
                  value={form.detail}
                  onChange={(e) => updateField("detail", e.target.value)}
                  placeholder="Bill description or payment detail"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <FileUploadField
                  id="payment-schedules"
                  label="Bill copy / document"
                  value={form.billCopyPath}
                  onChange={(v) => updateField("billCopyPath", v)}
                  placeholder="Upload scanned bill copy or enter path"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  value={form.remarks}
                  onChange={(e) => updateField("remarks", e.target.value)}
                  placeholder="Status notes or follow-up remarks…"
                  className="min-h-16"
                />
              </div>
            </div>
          </div>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating payment schedule" : "Editing payment schedule")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex justify-end gap-2 pt-4">
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
              {isEdit ? "Save changes" : "Create schedule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

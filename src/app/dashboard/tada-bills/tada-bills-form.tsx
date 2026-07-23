"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { createTadaClaim, updateTadaClaim } from "@/lib/actions/tada-bills";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { Plus, Loader2 } from "lucide-react";

interface StaffOption {
  id: string;
  name: string;
}

interface TadaClaimEditData {
  id: string;
  staffId: string;
  tourPurpose: string;
  fromDate: Date | string;
  toDate: Date | string;
  location: string;
  travelExpense: unknown;
  accommodationExp: unknown;
  foodExpense: unknown;
  localConveyance: unknown;
  otherExpense: unknown;
  advanceAmount: unknown;
  status: string;
  staff: { name: string };
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

export function TadaClaimFormDialog({ staff }: { staff: StaffOption[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [staffId, setStaffId] = useState("");
  const [tourPurpose, setTourPurpose] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [location, setLocation] = useState("");
  const [travelExpense, setTravelExpense] = useState("0");
  const [accommodationExp, setAccommodationExp] = useState("0");
  const [foodExpense, setFoodExpense] = useState("0");
  const [localConveyance, setLocalConveyance] = useState("0");
  const [otherExpense, setOtherExpense] = useState("0");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [billCopyPath, setBillCopyPath] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await createTadaClaim({
        staffId,
        tourPurpose,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        location,
        travelExpense,
        accommodationExp,
        foodExpense,
        localConveyance,
        otherExpense,
        advanceAmount: advanceAmount || undefined,
        billCopyPath: billCopyPath || undefined,
      } as never);

      if (res.success) {
        setOpen(false);
        window.location.reload();
      } else {
        setError(res.error ?? "Failed to create claim");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Claim
        </Button>
      } />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New TADA Claim</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Employee</Label>
              <Select value={staffId} onValueChange={(v) => setStaffId(v ?? "")}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Location</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Tour Purpose</Label>
              <Textarea
                value={tourPurpose}
                onChange={(e) => setTourPurpose(e.target.value)}
                required
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t pt-3">
            <div className="space-y-1">
              <Label className="text-xs">Travel ₹</Label>
              <Input
                type="number"
                step="0.01"
                value={travelExpense}
                onChange={(e) => setTravelExpense(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Accommodation ₹</Label>
              <Input
                type="number"
                step="0.01"
                value={accommodationExp}
                onChange={(e) => setAccommodationExp(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Food ₹</Label>
              <Input
                type="number"
                step="0.01"
                value={foodExpense}
                onChange={(e) => setFoodExpense(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Local Conveyance ₹</Label>
              <Input
                type="number"
                step="0.01"
                value={localConveyance}
                onChange={(e) => setLocalConveyance(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Other ₹</Label>
              <Input
                type="number"
                step="0.01"
                value={otherExpense}
                onChange={(e) => setOtherExpense(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Advance ₹</Label>
              <Input
                type="number"
                step="0.01"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
              />
            </div>
          </div>

          <FileUploadField
            id="tada-bills"
            label="Bill copy / supporting documents"
            value={billCopyPath}
            onChange={setBillCopyPath}
            placeholder="Upload bill copy or enter path"
          />

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create Claim
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TadaClaimEditForm({
  claim,
  staff,
  onClose,
}: {
  claim: TadaClaimEditData;
  staff: StaffOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    staffId: claim.staffId,
    tourPurpose: claim.tourPurpose,
    fromDate: toInputDate(claim.fromDate),
    toDate: toInputDate(claim.toDate),
    location: claim.location,
    travelExpense: toMoneyString(claim.travelExpense) || "0",
    accommodationExp: toMoneyString(claim.accommodationExp) || "0",
    foodExpense: toMoneyString(claim.foodExpense) || "0",
    localConveyance: toMoneyString(claim.localConveyance) || "0",
    otherExpense: toMoneyString(claim.otherExpense) || "0",
    advanceAmount: toMoneyString(claim.advanceAmount),
    billCopyPath: (claim as { billCopyPath?: string }).billCopyPath ?? "",
  });

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await updateTadaClaim({
        id: claim.id,
        staffId: form.staffId,
        tourPurpose: form.tourPurpose,
        fromDate: form.fromDate ? new Date(form.fromDate) : undefined,
        toDate: form.toDate ? new Date(form.toDate) : undefined,
        location: form.location,
        travelExpense: form.travelExpense || "0",
        accommodationExp: form.accommodationExp || "0",
        foodExpense: form.foodExpense || "0",
        localConveyance: form.localConveyance || "0",
        otherExpense: form.otherExpense || "0",
        advanceAmount: form.advanceAmount || undefined,
        billCopyPath: form.billCopyPath || undefined,
      } as never);

      if (!res.success) {
        setError(res.error ?? "Failed to update claim");
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

  const totalClaim =
    (Number(form.travelExpense) || 0) +
    (Number(form.accommodationExp) || 0) +
    (Number(form.foodExpense) || 0) +
    (Number(form.localConveyance) || 0) +
    (Number(form.otherExpense) || 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit TADA Claim</DialogTitle>
          <DialogDescription>
            Update claim for {claim.staff?.name ?? "employee"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Employee</Label>
                <Select
                  value={form.staffId}
                  onValueChange={(v) => updateField("staffId", v ?? "")}
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => updateField("location", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tour Purpose</Label>
              <Textarea
                value={form.tourPurpose}
                onChange={(e) => updateField("tourPurpose", e.target.value)}
                required
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From Date</Label>
                <Input
                  type="date"
                  value={form.fromDate}
                  onChange={(e) => updateField("fromDate", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Date</Label>
                <Input
                  type="date"
                  value={form.toDate}
                  onChange={(e) => updateField("toDate", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t pt-3">
              <div className="space-y-1">
                <Label className="text-xs">Travel ₹</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.travelExpense}
                  onChange={(e) => updateField("travelExpense", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Accommodation ₹</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.accommodationExp}
                  onChange={(e) => updateField("accommodationExp", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Food ₹</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.foodExpense}
                  onChange={(e) => updateField("foodExpense", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Local Conveyance ₹</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.localConveyance}
                  onChange={(e) => updateField("localConveyance", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Other ₹</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.otherExpense}
                  onChange={(e) => updateField("otherExpense", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Advance ₹</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.advanceAmount}
                  onChange={(e) => updateField("advanceAmount", e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-md bg-zinc-50 p-2 text-sm">
              <div className="flex justify-between">
                <span className="text-xs text-zinc-500">Total Claim Amount</span>
                <span className="font-mono font-medium">
                  ₹{totalClaim.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {form.advanceAmount && (
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-zinc-500">Balance</span>
                  <span className="font-mono font-medium">
                    ₹{(Number(form.advanceAmount) - totalClaim).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          </div>

          <FileUploadField
            id="tada-bills"
            label="Bill copy / supporting documents"
            value={form.billCopyPath}
            onChange={(v) => updateField("billCopyPath", v)}
            placeholder="Upload bill copy or enter path"
          />

          {error && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TadaApprovalActions({
  claimId,
  status,
  onClose,
}: {
  claimId: string;
  status: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [paymentMode, setPaymentMode] = useState("");

  async function handleAction(
    action:
      | "manager_approve"
      | "manager_reject"
      | "accounts_verify"
      | "accounts_query"
      | "finance_approve"
      | "mark_paid"
  ) {
    setSubmitting(true);
    setError(null);

    const { processTadaApproval } = await import("@/lib/actions/tada-bills");
    const res = await processTadaApproval({
      id: claimId,
      action,
      remarks: remarks || undefined,
      paymentMode: paymentMode || undefined,
    } as never);

    setSubmitting(false);

    if (!res.success) {
      setError(res.error ?? "Failed to process approval");
      return;
    }

    router.refresh();
    onClose();
  }

  const actions: { label: string; action: typeof handleAction extends (a: infer A) => void ? A : never; variant: "default" | "outline" | "destructive" }[] = [];

  if (status === "SUBMITTED") {
    actions.push({ label: "Manager Approve", action: "manager_approve", variant: "default" });
    actions.push({ label: "Manager Reject", action: "manager_reject", variant: "destructive" });
  } else if (status === "MANAGER_APPROVED") {
    actions.push({ label: "Accounts Verify", action: "accounts_verify", variant: "default" });
    actions.push({ label: "Accounts Query", action: "accounts_query", variant: "outline" });
  } else if (status === "ACCOUNTS_VERIFIED") {
    actions.push({ label: "Finance Approve", action: "finance_approve", variant: "default" });
  } else if (status === "FINANCE_APPROVED") {
    actions.push({ label: "Mark Paid", action: "mark_paid", variant: "default" });
  }

  if (actions.length === 0) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approval Actions</DialogTitle>
          <DialogDescription>
            Current status: <span className="font-medium">{status.replace(/_/g, " ")}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {status === "FINANCE_APPROVED" && (
            <div className="space-y-1">
              <Label className="text-xs">Payment Mode</Label>
              <Input
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                placeholder="e.g. Bank Transfer, Salary"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Approval / rejection remarks…"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.action}
                variant={a.variant}
                size="sm"
                disabled={submitting}
                onClick={() => handleAction(a.action)}
              >
                {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

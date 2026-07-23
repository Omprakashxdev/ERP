"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  JourneyLog,
  JourneyApprovalStatus,
  Vehicle,
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
import {
  createJourneyLog,
  updateJourneyLog,
} from "@/lib/actions/vehicle-log-book";
import { Loader2, X, Plus } from "lucide-react";

interface JourneyLogFormProps {
  journeyLog?: JourneyLog & { vehicle?: Vehicle; photos?: { path: string }[] };
  vehicles: { id: string; registrationNumber: string }[];
  mode: "create" | "edit";
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

function getInitialForm(
  journeyLog?: JourneyLog & { vehicle?: Vehicle; photos?: { path: string }[] },
  defaultVehicleId?: string
) {
  if (!journeyLog) {
    return {
      vehicleId: defaultVehicleId ?? "",
      journeyDate: toInputDate(new Date()),
      fromLocation: "",
      toLocation: "",
      startKm: "",
      endKm: "",
      totalKm: "",
      fuelExpense: "",
      serviceExpense: "",
      maintenanceExpense: "",
      taxExpense: "",
      driverName: "",
      purpose: "",
      approvalStatus: JourneyApprovalStatus.PENDING,
      rejectedReason: "",
      photos: [] as string[],
    };
  }
  return {
    vehicleId: journeyLog.vehicleId,
    journeyDate: toInputDate(journeyLog.journeyDate),
    fromLocation: journeyLog.fromLocation,
    toLocation: journeyLog.toLocation,
    startKm: toMoneyString(journeyLog.startKm),
    endKm: toMoneyString(journeyLog.endKm),
    totalKm: toMoneyString(journeyLog.totalKm),
    fuelExpense: toMoneyString(journeyLog.fuelExpense),
    serviceExpense: toMoneyString(journeyLog.serviceExpense),
    maintenanceExpense: toMoneyString(journeyLog.maintenanceExpense),
    taxExpense: toMoneyString(journeyLog.taxExpense),
    driverName: journeyLog.driverName ?? "",
    purpose: journeyLog.purpose ?? "",
    approvalStatus: journeyLog.approvalStatus,
    rejectedReason: journeyLog.rejectedReason ?? "",
    photos: journeyLog.photos?.map((p) => p.path) ?? [],
  };
}

export function JourneyLogForm({
  journeyLog,
  vehicles,
  mode,
  onClose,
}: JourneyLogFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(journeyLog));
  const [newPhoto, setNewPhoto] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computedTotalKm = useMemo(() => {
    const start = Number(form.startKm);
    const end = Number(form.endKm);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return (end - start).toFixed(2);
    }
    return "";
  }, [form.startKm, form.endKm]);

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addPhoto() {
    if (!newPhoto.trim()) return;
    setForm((prev) => ({
      ...prev,
      photos: [...prev.photos, newPhoto.trim()],
    }));
    setNewPhoto("");
  }

  function removePhoto(index: number) {
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
    }));
  }

  function buildPayload() {
    const base = {
      vehicleId: form.vehicleId,
      journeyDate: form.journeyDate || undefined,
      fromLocation: emptyToNull(form.fromLocation) ?? "",
      toLocation: emptyToNull(form.toLocation) ?? "",
      startKm: form.startKm || null,
      endKm: form.endKm || null,
      totalKm: computedTotalKm || null,
      fuelExpense: form.fuelExpense || null,
      serviceExpense: form.serviceExpense || null,
      maintenanceExpense: form.maintenanceExpense || null,
      taxExpense: form.taxExpense || null,
      driverName: emptyToNull(form.driverName),
      purpose: emptyToNull(form.purpose),
      approvalStatus: form.approvalStatus,
      rejectedReason:
        form.approvalStatus === "REJECTED"
          ? emptyToNull(form.rejectedReason)
          : null,
      photos: form.photos.length > 0 ? form.photos : undefined,
    };

    if (isEdit) {
      return { id: journeyLog!.id, ...base };
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
        ? await updateJourneyLog(
            payload as unknown as Parameters<typeof updateJourneyLog>[0]
          )
        : await createJourneyLog(
            payload as unknown as Parameters<typeof createJourneyLog>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save journey log.");
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

  const title = isEdit ? "Edit journey log" : "New journey log";
  const description = isEdit
    ? "Update journey details, expenses, and approval status."
    : "Record a new journey with route, KM readings, and expenses.";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="vehicleId">Vehicle</Label>
                <Select
                  value={form.vehicleId}
                  onValueChange={(v) => updateField("vehicleId", v ?? "")}
                >
                  <SelectTrigger id="vehicleId">
                    <SelectValue placeholder="Select vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.registrationNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="journeyDate">Journey date</Label>
                <Input
                  id="journeyDate"
                  type="date"
                  value={form.journeyDate}
                  onChange={(e) => updateField("journeyDate", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="approvalStatus">Approval status</Label>
                <Select
                  value={form.approvalStatus}
                  onValueChange={(v) =>
                    updateField("approvalStatus", v as JourneyApprovalStatus)
                  }
                >
                  <SelectTrigger id="approvalStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(JourneyApprovalStatus).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.toLowerCase().replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fromLocation">From</Label>
                <Input
                  id="fromLocation"
                  value={form.fromLocation}
                  onChange={(e) => updateField("fromLocation", e.target.value)}
                  placeholder="Start location"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="toLocation">To</Label>
                <Input
                  id="toLocation"
                  value={form.toLocation}
                  onChange={(e) => updateField("toLocation", e.target.value)}
                  placeholder="Destination"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="startKm">Start KM</Label>
                <Input
                  id="startKm"
                  type="number"
                  step="0.01"
                  value={form.startKm}
                  onChange={(e) => updateField("startKm", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="endKm">End KM</Label>
                <Input
                  id="endKm"
                  type="number"
                  step="0.01"
                  value={form.endKm}
                  onChange={(e) => updateField("endKm", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="totalKm">Total KM</Label>
                <Input
                  id="totalKm"
                  type="number"
                  step="0.01"
                  value={computedTotalKm}
                  readOnly
                  className="bg-zinc-50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fuelExpense">Fuel expense (₹)</Label>
                <Input
                  id="fuelExpense"
                  type="number"
                  step="0.01"
                  value={form.fuelExpense}
                  onChange={(e) => updateField("fuelExpense", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="serviceExpense">Service expense (₹)</Label>
                <Input
                  id="serviceExpense"
                  type="number"
                  step="0.01"
                  value={form.serviceExpense}
                  onChange={(e) => updateField("serviceExpense", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="maintenanceExpense">Maintenance expense (₹)</Label>
                <Input
                  id="maintenanceExpense"
                  type="number"
                  step="0.01"
                  value={form.maintenanceExpense}
                  onChange={(e) => updateField("maintenanceExpense", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="taxExpense">Tax / toll expense (₹)</Label>
                <Input
                  id="taxExpense"
                  type="number"
                  step="0.01"
                  value={form.taxExpense}
                  onChange={(e) => updateField("taxExpense", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="driverName">Driver name</Label>
                <Input
                  id="driverName"
                  value={form.driverName}
                  onChange={(e) => updateField("driverName", e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="purpose">Purpose</Label>
                <Input
                  id="purpose"
                  value={form.purpose}
                  onChange={(e) => updateField("purpose", e.target.value)}
                />
              </div>

              {form.approvalStatus === "REJECTED" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="rejectedReason">Rejected reason</Label>
                  <Input
                    id="rejectedReason"
                    value={form.rejectedReason}
                    onChange={(e) => updateField("rejectedReason", e.target.value)}
                    placeholder="Reason for rejection"
                  />
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Photo paths</Label>
                <div className="flex gap-2">
                  <Input
                    value={newPhoto}
                    onChange={(e) => setNewPhoto(e.target.value)}
                    placeholder="Add a photo path"
                    className="flex-1"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addPhoto}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
                <div className="mt-2 space-y-1">
                  {form.photos.map((photo, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-1.5 text-xs"
                    >
                      <span className="truncate">{photo}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => removePhoto(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

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
              {isEdit ? "Save changes" : "Create journey log"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

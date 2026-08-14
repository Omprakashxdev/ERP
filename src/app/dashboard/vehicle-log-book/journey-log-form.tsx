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
import { FileUploadField } from "@/components/ui/file-upload-field";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface JourneyLogFormProps {
  journeyLog?: JourneyLog & { vehicle?: Vehicle; photos?: { path: string }[]; approvedBy?: { id: string; name: string } | null };
  vehicles: { id: string; registrationNumber: string }[];
  staff: { id: string; name: string }[];
  cities?: { id: string; name: string }[];
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

function getInitialForm(journeyLog: JourneyLog | undefined, cities: { name: string }[] = []) {
  if (!journeyLog) {
    return {
      vehicleId: "",
      journeyDate: toInputDate(new Date()),
      fromLocation: "",
      toLocation: "",
      startKm: "",
      endKm: "",
      totalKm: "",
      startKmPhotoPath: "",
      endKmPhotoPath: "",
      fuelExpense: "",
      fuelBillPath: "",
      serviceParticulars: "",
      serviceExpense: "",
      serviceBillPath: "",
      maintenanceParticulars: "",
      maintenanceExpense: "",
      maintenanceBillPath: "",
      taxExpense: "",
      taxReceiptPath: "",
      personsTravelling: "",
      driverName: "",
      purpose: "",
      remarks: "",
      approvalStatus: JourneyApprovalStatus.PENDING,
      rejectedReason: "",
      approvedById: "",
      photos: [] as string[],
    };
  }
  return {
    vehicleId: journeyLog.vehicleId,
    journeyDate: toInputDate(journeyLog.journeyDate),
    fromLocation: journeyLog.fromLocation 
      ? (cities.some(c => c.name === journeyLog.fromLocation) ? journeyLog.fromLocation : "__other__" + journeyLog.fromLocation)
      : "",
    toLocation: journeyLog.toLocation
      ? (cities.some(c => c.name === journeyLog.toLocation) ? journeyLog.toLocation : "__other__" + journeyLog.toLocation)
      : "",
    startKm: toMoneyString(journeyLog.startKm),
    endKm: toMoneyString(journeyLog.endKm),
    totalKm: toMoneyString(journeyLog.totalKm),
    startKmPhotoPath: journeyLog.startKmPhotoPath ?? "",
    endKmPhotoPath: journeyLog.endKmPhotoPath ?? "",
    fuelExpense: toMoneyString(journeyLog.fuelExpense),
    fuelBillPath: journeyLog.fuelBillPath ?? "",
    serviceParticulars: journeyLog.serviceParticulars ?? "",
    serviceExpense: toMoneyString(journeyLog.serviceExpense),
    serviceBillPath: journeyLog.serviceBillPath ?? "",
    maintenanceParticulars: journeyLog.maintenanceParticulars ?? "",
    maintenanceExpense: toMoneyString(journeyLog.maintenanceExpense),
    maintenanceBillPath: journeyLog.maintenanceBillPath ?? "",
    taxExpense: toMoneyString(journeyLog.taxExpense),
    taxReceiptPath: journeyLog.taxReceiptPath ?? "",
    personsTravelling: journeyLog.personsTravelling ?? "",
    driverName: journeyLog.driverName ?? "",
    purpose: journeyLog.purpose ?? "",
    remarks: journeyLog.remarks ?? "",
    approvalStatus: journeyLog.approvalStatus,
    rejectedReason: journeyLog.rejectedReason ?? "",
    approvedById: journeyLog.approvedById ?? "",
    photos: (journeyLog as any).photos?.map((p: any) => p.path) ?? [],
  };
}

export function JourneyLogForm({
  journeyLog,
  vehicles,
  staff,
  cities = [],
  mode,
  onClose,
}: JourneyLogFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(journeyLog, cities));
  const [newPhoto, setNewPhoto] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

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

  function removePhoto(index: number) {
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.filter((_: string, i: number) => i !== index),
    }));
  }

  function buildPayload() {
    const base = {
      vehicleId: form.vehicleId,
      journeyDate: form.journeyDate || undefined,
      fromLocation: emptyToNull(form.fromLocation.replace(/^__other__/, "")) ?? "",
      toLocation: emptyToNull(form.toLocation.replace(/^__other__/, "")) ?? "",
      startKm: form.startKm || null,
      endKm: form.endKm || null,
      totalKm: computedTotalKm || null,
      startKmPhotoPath: emptyToNull(form.startKmPhotoPath),
      endKmPhotoPath: emptyToNull(form.endKmPhotoPath),
      fuelExpense: form.fuelExpense || null,
      fuelBillPath: emptyToNull(form.fuelBillPath),
      serviceParticulars: emptyToNull(form.serviceParticulars),
      serviceExpense: form.serviceExpense || null,
      serviceBillPath: emptyToNull(form.serviceBillPath),
      maintenanceParticulars: emptyToNull(form.maintenanceParticulars),
      maintenanceExpense: form.maintenanceExpense || null,
      maintenanceBillPath: emptyToNull(form.maintenanceBillPath),
      taxExpense: form.taxExpense || null,
      taxReceiptPath: emptyToNull(form.taxReceiptPath),
      personsTravelling: emptyToNull(form.personsTravelling),
      driverName: emptyToNull(form.driverName),
      purpose: emptyToNull(form.purpose),
      remarks: emptyToNull(form.remarks),
      approvalStatus: form.approvalStatus,
      rejectedReason:
        form.approvalStatus === "REJECTED"
          ? emptyToNull(form.rejectedReason)
          : null,
      approvedById: emptyToNull(form.approvedById),
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
        toast.error(result.error ?? "Failed to save journey log.");
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

    toast.success(mode === "create" ? "Journey log created successfully" : "Journey log updated successfully");
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
                    <SelectValue placeholder="Select vehicle">
                      {(value: string) => vehicles.find((v) => v.id === value)?.registrationNumber ?? "Select vehicle"}
                    </SelectValue>
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

              {isEdit && (
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
              )}

              <div className="space-y-1.5">
                <Label htmlFor="fromLocation">From</Label>
                {cities.length > 0 ? (
                  <Select
                    value={form.fromLocation.startsWith("__other__") ? "__other__" : form.fromLocation}
                    onValueChange={(v) => {
                      if (v === "__other__") {
                        updateField("fromLocation", "__other__");
                      } else {
                        updateField("fromLocation", v ?? "");
                      }
                    }}
                  >
                    <SelectTrigger id="fromLocation">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                      <SelectItem value="__other__">Other (type manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                {cities.length === 0 || form.fromLocation.startsWith("__other__") ? (
                  <Input
                    id="fromLocationText"
                    value={form.fromLocation.replace(/^__other__/, "")}
                    onChange={(e) => updateField("fromLocation", "__other__" + e.target.value)}
                    placeholder="Start location"
                  />
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="toLocation">To</Label>
                {cities.length > 0 ? (
                  <Select
                    value={form.toLocation.startsWith("__other__") ? "__other__" : form.toLocation}
                    onValueChange={(v) => {
                      if (v === "__other__") {
                        updateField("toLocation", "__other__");
                      } else {
                        updateField("toLocation", v ?? "");
                      }
                    }}
                  >
                    <SelectTrigger id="toLocation">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                      <SelectItem value="__other__">Other (type manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                {cities.length === 0 || form.toLocation.startsWith("__other__") ? (
                  <Input
                    id="toLocationText"
                    value={form.toLocation.replace(/^__other__/, "")}
                    onChange={(e) => updateField("toLocation", "__other__" + e.target.value)}
                    placeholder="End location"
                  />
                ) : null}
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

              <div className="space-y-1.5 sm:col-span-2">
                <FileUploadField
                  id="journey-startKm-photo"
                  label="Start KM odometer photo"
                  value={form.startKmPhotoPath}
                  onChange={(v) => updateField("startKmPhotoPath", v)}
                  accept=".jpg,.jpeg,.png,.pdf"
                  placeholder="Upload odometer photo at start of journey"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <FileUploadField
                  id="journey-endKm-photo"
                  label="End KM odometer photo"
                  value={form.endKmPhotoPath}
                  onChange={(v) => updateField("endKmPhotoPath", v)}
                  accept=".jpg,.jpeg,.png,.pdf"
                  placeholder="Upload odometer photo at end of journey"
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

              <div className="space-y-1.5 sm:col-span-2">
                <FileUploadField
                  id="journey-fuel-bill"
                  label="Fuel bill + odometer photo"
                  value={form.fuelBillPath}
                  onChange={(v) => updateField("fuelBillPath", v)}
                  accept=".jpg,.jpeg,.png,.pdf"
                  placeholder="Upload petrol bill & odometer photo"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="serviceParticulars">Service particulars</Label>
                <Input
                  id="serviceParticulars"
                  value={form.serviceParticulars}
                  onChange={(e) => updateField("serviceParticulars", e.target.value)}
                  placeholder="Description of service"
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

              <div className="space-y-1.5 sm:col-span-2">
                <FileUploadField
                  id="journey-service-bill"
                  label="Service bill + odometer photo"
                  value={form.serviceBillPath}
                  onChange={(v) => updateField("serviceBillPath", v)}
                  accept=".jpg,.jpeg,.png,.pdf"
                  placeholder="Upload service bill & odometer photo"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="maintenanceParticulars">Maintenance particulars</Label>
                <Input
                  id="maintenanceParticulars"
                  value={form.maintenanceParticulars}
                  onChange={(e) => updateField("maintenanceParticulars", e.target.value)}
                  placeholder="Description of maintenance"
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

              <div className="space-y-1.5 sm:col-span-2">
                <FileUploadField
                  id="journey-maintenance-bill"
                  label="Maintenance bill + odometer photo"
                  value={form.maintenanceBillPath}
                  onChange={(v) => updateField("maintenanceBillPath", v)}
                  accept=".jpg,.jpeg,.png,.pdf"
                  placeholder="Upload maintenance bill & odometer photo"
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

              <div className="space-y-1.5 sm:col-span-2">
                <FileUploadField
                  id="journey-tax-receipt"
                  label="Tax / toll receipt"
                  value={form.taxReceiptPath}
                  onChange={(v) => updateField("taxReceiptPath", v)}
                  accept=".jpg,.jpeg,.png,.pdf"
                  placeholder="Upload tax receipt"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="personsTravelling">Persons travelling</Label>
                <Input
                  id="personsTravelling"
                  value={form.personsTravelling}
                  onChange={(e) => updateField("personsTravelling", e.target.value)}
                  placeholder="Names of people travelling (comma separated)"
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
                <Label htmlFor="purpose">Purpose of travel</Label>
                <Input
                  id="purpose"
                  value={form.purpose}
                  onChange={(e) => updateField("purpose", e.target.value)}
                  placeholder="e.g. Site visit, Client meeting"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Input
                  id="remarks"
                  value={form.remarks}
                  onChange={(e) => updateField("remarks", e.target.value)}
                  placeholder="Any additional remarks"
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

              {isEdit && form.approvalStatus !== "PENDING" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="approvedById">Approved by (travelling authority)</Label>
                  <Select
                    value={form.approvedById}
                    onValueChange={(v) => updateField("approvedById", v ?? "")}
                  >
                    <SelectTrigger id="approvedById">
                      <SelectValue placeholder="Select approving authority">
                        {(value: string) =>
                          value
                            ? staff.find((s) => s.id === value)?.name ?? "Select approving authority"
                            : "Select approving authority"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No approver</SelectItem>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <FileUploadField
                  id="journey-photo"
                  label="Attach photo / document"
                  value={newPhoto}
                  onChange={(path) => {
                    if (path) {
                      setForm((prev) => ({
                        ...prev,
                        photos: [...prev.photos, path],
                      }));
                      setNewPhoto("");
                    }
                  }}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  placeholder="Click browse to attach a photo or document"
                />
                {form.photos.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {form.photos.map((photo: string, index: number) => (
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
                )}
              </div>
            </div>
          </div>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating journey log" : "Editing journey log")} askingAi={askingAi} aiResponse={aiResponse} />

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

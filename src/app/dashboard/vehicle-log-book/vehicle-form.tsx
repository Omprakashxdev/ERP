"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Vehicle, VehicleStatus } from "@prisma/client";
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
import { createVehicle, updateVehicle } from "@/lib/actions/vehicle-log-book";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface VehicleFormProps {
  vehicle?: Vehicle;
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

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

function getInitialForm(vehicle?: Vehicle) {
  if (!vehicle) {
    return {
      registrationNumber: "",
      make: "",
      model: "",
      year: "",
      status: VehicleStatus.ACTIVE,
      rcNumber: "",
      rcExpiryDate: "",
      rcCopyPath: "",
      insurancePolicyNumber: "",
      insuranceExpiryDate: "",
      insuranceCopyPath: "",
      pucNumber: "",
      pucExpiryDate: "",
      pucCopyPath: "",
      tyreWarrantyExpiryDate: "",
      batteryWarrantyExpiryDate: "",
    };
  }
  return {
    registrationNumber: vehicle.registrationNumber,
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    year: vehicle.year?.toString() ?? "",
    status: vehicle.status,
    rcNumber: vehicle.rcNumber ?? "",
    rcExpiryDate: toInputDate(vehicle.rcExpiryDate),
    rcCopyPath: vehicle.rcCopyPath ?? "",
    insurancePolicyNumber: vehicle.insurancePolicyNumber ?? "",
    insuranceExpiryDate: toInputDate(vehicle.insuranceExpiryDate),
    insuranceCopyPath: vehicle.insuranceCopyPath ?? "",
    pucNumber: (vehicle as any).pucNumber ?? "",
    pucExpiryDate: toInputDate(vehicle.pucExpiryDate),
    pucCopyPath: vehicle.pucCopyPath ?? "",
    tyreWarrantyExpiryDate: toInputDate(vehicle.tyreWarrantyExpiryDate),
    batteryWarrantyExpiryDate: toInputDate(vehicle.batteryWarrantyExpiryDate),
  };
}

export function VehicleForm({ vehicle, mode, onClose }: VehicleFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(vehicle));
  const [activeTab, setActiveTab] = useState("details");
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
      registrationNumber: form.registrationNumber,
      make: emptyToNull(form.make),
      model: emptyToNull(form.model),
      year: form.year ? Number(form.year) : null,
      status: form.status,
      rcNumber: emptyToNull(form.rcNumber),
      rcExpiryDate: form.rcExpiryDate || null,
      rcCopyPath: emptyToNull(form.rcCopyPath),
      insurancePolicyNumber: emptyToNull(form.insurancePolicyNumber),
      insuranceExpiryDate: form.insuranceExpiryDate || null,
      insuranceCopyPath: emptyToNull(form.insuranceCopyPath),
      pucNumber: emptyToNull(form.pucNumber),
      pucExpiryDate: form.pucExpiryDate || null,
      pucCopyPath: emptyToNull(form.pucCopyPath),
      tyreWarrantyExpiryDate: form.tyreWarrantyExpiryDate || null,
      batteryWarrantyExpiryDate: form.batteryWarrantyExpiryDate || null,
    };

    if (isEdit) {
      return { id: vehicle!.id, ...base };
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
        ? await updateVehicle(payload as unknown as Parameters<typeof updateVehicle>[0])
        : await createVehicle(payload as unknown as Parameters<typeof createVehicle>[0]);

      if (!result.success) {
        setError(result.error ?? "Failed to save vehicle.");
        toast.error(result.error ?? "Failed to save vehicle.");
        return;
      }

      toast.success(mode === "create" ? "Vehicle created successfully" : "Vehicle updated successfully");
      router.refresh();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("fetch") || message.includes("network") || message.includes("proxy")) {
        const friendlyMsg = "Unable to reach the server. Please check your connection and try again.";
        setError(friendlyMsg);
        toast.error(friendlyMsg);
      } else {
        setError(message || "An unexpected error occurred.");
        toast.error(message || "An unexpected error occurred.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const title = isEdit ? "Edit vehicle" : "New vehicle";
  const description = isEdit
    ? "Update vehicle details, documents, and warranty information."
    : "Register a new vehicle and track its documents and warranties.";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v ?? "details")}
            className="flex-1 overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="warranty">Warranty</TabsTrigger>
            </TabsList>

            <TabsContent
              value="details"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="registrationNumber">Registration number</Label>
                  <Input
                    id="registrationNumber"
                    value={form.registrationNumber}
                    onChange={(e) => updateField("registrationNumber", e.target.value)}
                    placeholder="e.g. GJ-03-AB-1234"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="make">Make</Label>
                  <Input
                    id="make"
                    value={form.make}
                    onChange={(e) => updateField("make", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={form.model}
                    onChange={(e) => updateField("model", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    type="number"
                    value={form.year}
                    onChange={(e) => updateField("year", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => updateField("status", v as VehicleStatus)
                    }
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(VehicleStatus).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.toLowerCase().replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="documents"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rcNumber">R.C. number</Label>
                  <Input
                    id="rcNumber"
                    value={form.rcNumber}
                    onChange={(e) => updateField("rcNumber", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rcExpiryDate">R.C. expiry date</Label>
                  <Input
                    id="rcExpiryDate"
                    type="date"
                    value={form.rcExpiryDate}
                    onChange={(e) => updateField("rcExpiryDate", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <FileUploadField
                    id="vehicle-rc"
                    label="R.C. copy"
                    value={form.rcCopyPath}
                    onChange={(v) => updateField("rcCopyPath", v)}
                    placeholder="Upload R.C. copy or enter path"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="insurancePolicyNumber">Insurance policy number</Label>
                  <Input
                    id="insurancePolicyNumber"
                    value={form.insurancePolicyNumber}
                    onChange={(e) => updateField("insurancePolicyNumber", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="insuranceExpiryDate">Insurance expiry date</Label>
                  <Input
                    id="insuranceExpiryDate"
                    type="date"
                    value={form.insuranceExpiryDate}
                    onChange={(e) => updateField("insuranceExpiryDate", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <FileUploadField
                    id="vehicle-insurance"
                    label="Insurance copy"
                    value={form.insuranceCopyPath}
                    onChange={(v) => updateField("insuranceCopyPath", v)}
                    placeholder="Upload insurance copy or enter path"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pucNumber">P.U.C number</Label>
                  <Input
                    id="pucNumber"
                    value={form.pucNumber}
                    onChange={(e) => updateField("pucNumber", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pucExpiryDate">P.U.C expiry date</Label>
                  <Input
                    id="pucExpiryDate"
                    type="date"
                    value={form.pucExpiryDate}
                    onChange={(e) => updateField("pucExpiryDate", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <FileUploadField
                    id="vehicle-puc"
                    label="P.U.C copy"
                    value={form.pucCopyPath}
                    onChange={(v) => updateField("pucCopyPath", v)}
                    placeholder="Upload P.U.C copy or enter path"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="warranty"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tyreWarrantyExpiryDate">Tyre warranty expiry</Label>
                  <Input
                    id="tyreWarrantyExpiryDate"
                    type="date"
                    value={form.tyreWarrantyExpiryDate}
                    onChange={(e) =>
                      updateField("tyreWarrantyExpiryDate", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="batteryWarrantyExpiryDate">Battery warranty expiry</Label>
                  <Input
                    id="batteryWarrantyExpiryDate"
                    type="date"
                    value={form.batteryWarrantyExpiryDate}
                    onChange={(e) =>
                      updateField("batteryWarrantyExpiryDate", e.target.value)
                    }
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating vehicle" : "Editing vehicle")} askingAi={askingAi} aiResponse={aiResponse} />

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
              {isEdit ? "Save changes" : "Create vehicle"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Asset, AssetStatus } from "@prisma/client";
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
  createAsset,
  updateAsset,
} from "@/lib/actions/asset";
import { FileUploadField } from "@/components/ui/file-upload-field";
import type { MasterData } from "@/lib/master-data";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface AssetFormProps {
  asset?: Asset;
  mode: "create" | "edit";
  masters?: MasterData;
  onClose: () => void;
}

function toQuantityString(value: unknown): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

function getInitialForm(asset?: Asset) {
  if (!asset) {
    return {
      name: "",
      category: "",
      make: "",
      model: "",
      yearOfPurchase: "",
      quantity: "1.00",
      securityCode: "",
      billWarrantyPath: "",
      assigneeType: "" as "PERSON" | "OFFICE" | "",
      assignee: "",
      assignedQuantity: "",
      responsiblePerson: "",
      status: AssetStatus.AVAILABLE,
      remarks: "",
    };
  }
  return {
    name: asset.name,
    category: asset.category ?? "",
    make: asset.make ?? "",
    model: asset.model ?? "",
    yearOfPurchase: asset.yearOfPurchase ? String(asset.yearOfPurchase) : "",
    quantity: toQuantityString(asset.quantity),
    securityCode: asset.securityCode ?? "",
    billWarrantyPath: asset.billWarrantyPath ?? "",
    assigneeType: (asset.assigneeType as "PERSON" | "OFFICE") ?? "",
    assignee: asset.assignee ?? "",
    assignedQuantity: toQuantityString(asset.assignedQuantity),
    responsiblePerson: asset.responsiblePerson ?? "",
    status: asset.status,
    remarks: asset.remarks ?? "",
  };
}

export function AssetForm({ asset, mode, masters, onClose }: AssetFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(asset));
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
      name: form.name,
      category: emptyToNull(form.category),
      make: emptyToNull(form.make),
      model: emptyToNull(form.model),
      yearOfPurchase: form.yearOfPurchase ? Number(form.yearOfPurchase) : null,
      quantity: form.quantity || null,
      securityCode: emptyToNull(form.securityCode),
      billWarrantyPath: emptyToNull(form.billWarrantyPath),
      assigneeType: form.assigneeType || null,
      assignee: emptyToNull(form.assignee),
      assignedQuantity: form.assignedQuantity || null,
      responsiblePerson: emptyToNull(form.responsiblePerson),
      status: form.status,
      remarks: emptyToNull(form.remarks),
    };

    if (isEdit) {
      return { id: asset!.id, ...base };
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
        ? await updateAsset(
            payload as unknown as Parameters<typeof updateAsset>[0]
          )
        : await createAsset(
            payload as unknown as Parameters<typeof createAsset>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save asset.");
        toast.error(result.error ?? "Failed to save asset.");
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

    toast.success(mode === "create" ? "Asset created successfully" : "Asset updated successfully");
    router.refresh();
    onClose();
  }

  const title = isEdit ? "Edit asset" : "New asset";
  const description = isEdit
    ? "Update asset details, assignment, and status."
    : "Register a new asset with item code, category, and warranty details.";

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
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Name / Description</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="Asset name or property description"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                {masters && masters.assetCategories.length > 0 ? (
                  <Select
                    value={form.category}
                    onValueChange={(v) => updateField("category", v ?? "")}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {masters.assetCategories.map((c) => (
                        <SelectItem key={c.id} value={c.name}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="category"
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                    placeholder="e.g. Furniture, Electronics"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    updateField("status", v as AssetStatus)
                  }
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(AssetStatus).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.toLowerCase().replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="make">Make</Label>
                {masters && masters.assetMakes.length > 0 ? (
                  <Select
                    value={form.make}
                    onValueChange={(v) => updateField("make", v ?? "")}
                  >
                    <SelectTrigger id="make">
                      <SelectValue placeholder="Select make" />
                    </SelectTrigger>
                    <SelectContent>
                      {masters.assetMakes.map((m) => (
                        <SelectItem key={m.id} value={m.name}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="make"
                    value={form.make}
                    onChange={(e) => updateField("make", e.target.value)}
                    placeholder="Manufacturer"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="model">Model</Label>
                {masters && masters.assetModels.length > 0 ? (
                  <Select
                    value={form.model}
                    onValueChange={(v) => updateField("model", v ?? "")}
                  >
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {masters.assetModels
                        .filter((m) => !form.make || m.makeId === masters.assetMakes.find((mk) => mk.name === form.make)?.id)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.name}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="model"
                    value={form.model}
                    onChange={(e) => updateField("model", e.target.value)}
                    placeholder="Model number"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="yearOfPurchase">Year of purchase</Label>
                <Input
                  id="yearOfPurchase"
                  type="number"
                  value={form.yearOfPurchase}
                  onChange={(e) => updateField("yearOfPurchase", e.target.value)}
                  placeholder="e.g. 2023"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  value={form.quantity}
                  onChange={(e) => updateField("quantity", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="securityCode">Security code</Label>
                <Input
                  id="securityCode"
                  value={form.securityCode}
                  onChange={(e) => updateField("securityCode", e.target.value)}
                  placeholder="Asset security or serial code"
                />
              </div>

              <div className="space-y-1.5">
                <FileUploadField
                  id="assets"
                  label="Bill / warranty path"
                  value={form.billWarrantyPath}
                  onChange={(v) => updateField("billWarrantyPath", v)}
                  placeholder="Upload scanned bill or warranty copy"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="assigneeType">Assign to</Label>
                <Select
                  value={form.assigneeType}
                  onValueChange={(v) =>
                    updateField("assigneeType", v as "PERSON" | "OFFICE" | "")
                  }
                >
                  <SelectTrigger id="assigneeType">
                    <SelectValue placeholder="Select assignee type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    <SelectItem value="PERSON">Person</SelectItem>
                    <SelectItem value="OFFICE">Office</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="assignee">Assignee name</Label>
                <Input
                  id="assignee"
                  value={form.assignee}
                  onChange={(e) => updateField("assignee", e.target.value)}
                  placeholder="Person or office name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="assignedQuantity">Assigned quantity</Label>
                <Input
                  id="assignedQuantity"
                  type="number"
                  step="0.01"
                  value={form.assignedQuantity}
                  onChange={(e) => updateField("assignedQuantity", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="responsiblePerson">Responsible person</Label>
                <Input
                  id="responsiblePerson"
                  value={form.responsiblePerson}
                  onChange={(e) => updateField("responsiblePerson", e.target.value)}
                  placeholder="Name of responsible person"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  value={form.remarks}
                  onChange={(e) => updateField("remarks", e.target.value)}
                  placeholder="Additional notes or follow-up remarks…"
                  className="min-h-16"
                />
              </div>
            </div>
          </div>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating asset" : "Editing asset")} askingAi={askingAi} aiResponse={aiResponse} />

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
              {isEdit ? "Save changes" : "Create asset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

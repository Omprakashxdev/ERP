"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkType, ServiceType, Contractor } from "@prisma/client";
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
import { createContractor, updateContractor } from "@/lib/actions/contractor";
import { FileUploadField } from "@/components/ui/file-upload-field";
import type { MasterData } from "@/lib/master-data";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface ContractorFormProps {
  contractor?: Contractor;
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

function getInitialForm(contractor?: Contractor) {
  if (!contractor) {
    return {
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      contractAmount: "",
      agreementDate: "",
      workOrderDate: "",
      tenderId: "",
      detailedOrder: "",
      workName: "",
      workType: "" as WorkType | "",
      serviceType: "" as ServiceType | "",
      dprReference: "",
      tsAaReference: "",
      scheduleBAmount: "",
      scheduleBPath: "",
      raBillDetails: "",
      finalProgressAmount: "",
      finalProgressProjectExpense: "",
      workOrderCopyPath: "",
      drawingsPath: "",
      completionCertificatePath: "",
    };
  }
  return {
    name: contractor.name,
    contactPerson: contractor.contactPerson ?? "",
    phone: contractor.phone ?? "",
    email: contractor.email ?? "",
    address: contractor.address ?? "",
    contractAmount: toMoneyString(contractor.contractAmount),
    agreementDate: toInputDate(contractor.agreementDate),
    workOrderDate: toInputDate(contractor.workOrderDate),
    tenderId: contractor.tenderId ?? "",
    detailedOrder: contractor.detailedOrder ?? "",
    workName: contractor.workName ?? "",
    workType: (contractor.workType ?? "") as WorkType | "",
    serviceType: (contractor.serviceType ?? "") as ServiceType | "",
    dprReference: contractor.dprReference ?? "",
    tsAaReference: contractor.tsAaReference ?? "",
    scheduleBAmount: toMoneyString(contractor.scheduleBAmount),
    scheduleBPath: contractor.scheduleBPath ?? "",
    raBillDetails: contractor.raBillDetails ?? "",
    finalProgressAmount: toMoneyString(contractor.finalProgressAmount),
    finalProgressProjectExpense: toMoneyString(
      contractor.finalProgressProjectExpense
    ),
    workOrderCopyPath: contractor.workOrderCopyPath ?? "",
    drawingsPath: contractor.drawingsPath ?? "",
    completionCertificatePath: contractor.completionCertificatePath ?? "",
  };
}

export function ContractorForm({
  contractor,
  mode,
  masters,
  onClose,
}: ContractorFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(contractor));
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
      name: form.name,
      contactPerson: emptyToNull(form.contactPerson),
      phone: emptyToNull(form.phone),
      email: emptyToNull(form.email),
      address: emptyToNull(form.address),
      contractAmount: form.contractAmount || null,
      agreementDate: form.agreementDate || null,
      workOrderDate: form.workOrderDate || null,
      tenderId: emptyToNull(form.tenderId),
      detailedOrder: emptyToNull(form.detailedOrder),
      workName: emptyToNull(form.workName),
      workType: form.workType || null,
      serviceType: form.serviceType || null,
      dprReference: emptyToNull(form.dprReference),
      tsAaReference: emptyToNull(form.tsAaReference),
      scheduleBAmount: form.scheduleBAmount || null,
      scheduleBPath: emptyToNull(form.scheduleBPath),
      raBillDetails: emptyToNull(form.raBillDetails),
      finalProgressAmount: form.finalProgressAmount || null,
      finalProgressProjectExpense: form.finalProgressProjectExpense || null,
      workOrderCopyPath: emptyToNull(form.workOrderCopyPath),
      drawingsPath: emptyToNull(form.drawingsPath),
      completionCertificatePath: emptyToNull(form.completionCertificatePath),
    };

    if (isEdit) {
      return { id: contractor!.id, ...base };
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
        ? await updateContractor(
            payload as unknown as Parameters<typeof updateContractor>[0]
          )
        : await createContractor(
            payload as unknown as Parameters<typeof createContractor>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save contractor.");
        toast.error(result.error ?? "Failed to save contractor.");
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

    toast.success(mode === "create" ? "Contractor created successfully" : "Contractor updated successfully");
    router.refresh();
    onClose();
  }

  const title = isEdit ? "Edit contractor" : "New contractor";
  const description = isEdit
    ? "Update contractor details, work specifications, and documents."
    : "Create a contractor record for project association.";

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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="workSpecs">Work Specs</TabsTrigger>
              <TabsTrigger value="documents">Documents & Billing</TabsTrigger>
            </TabsList>

            <TabsContent
              value="details"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="name">Contractor name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Name of contractor"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactPerson">Contact person</Label>
                  <Input
                    id="contactPerson"
                    value={form.contactPerson}
                    onChange={(e) =>
                      updateField("contactPerson", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={form.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    className="min-h-16"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contractAmount">Tender approved amount (₹)</Label>
                  <Input
                    id="contractAmount"
                    type="number"
                    step="0.01"
                    value={form.contractAmount}
                    onChange={(e) =>
                      updateField("contractAmount", e.target.value)
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
              </div>
            </TabsContent>

            <TabsContent
              value="workSpecs"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tenderId">Tender ID</Label>
                  <Input
                    id="tenderId"
                    value={form.tenderId}
                    onChange={(e) => updateField("tenderId", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="detailedOrder">Detailed order / department</Label>
                  {masters && masters.orderMasters.length > 0 ? (
                    <Select
                      value={form.detailedOrder}
                      onValueChange={(v) => updateField("detailedOrder", v ?? "")}
                    >
                      <SelectTrigger id="detailedOrder">
                        <SelectValue placeholder="Select order" />
                      </SelectTrigger>
                      <SelectContent>
                        {masters.orderMasters.map((o) => (
                          <SelectItem key={o.id} value={o.name}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="detailedOrder"
                      value={form.detailedOrder}
                      onChange={(e) =>
                        updateField("detailedOrder", e.target.value)
                      }
                    />
                  )}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="workName">Name of work</Label>
                  {masters && masters.workMasters.length > 0 ? (
                    <Select
                      value={form.workName}
                      onValueChange={(v) => updateField("workName", v ?? "")}
                    >
                      <SelectTrigger id="workName">
                        <SelectValue placeholder="Select work" />
                      </SelectTrigger>
                      <SelectContent>
                        {masters.workMasters.map((w) => (
                          <SelectItem key={w.id} value={w.name}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="workName"
                      value={form.workName}
                      onChange={(e) => updateField("workName", e.target.value)}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="workType">Type of work</Label>
                  <Select
                    value={form.workType}
                    onValueChange={(v) =>
                      updateField("workType", (v ?? "") as WorkType)
                    }
                  >
                    <SelectTrigger id="workType">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {Object.values(WorkType).map((wt) => (
                        <SelectItem key={wt} value={wt}>
                          {wt.toLowerCase().replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="serviceType">Service type</Label>
                  <Select
                    value={form.serviceType}
                    onValueChange={(v) =>
                      updateField("serviceType", (v ?? "") as ServiceType)
                    }
                  >
                    <SelectTrigger id="serviceType">
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {Object.values(ServiceType).map((st) => (
                        <SelectItem key={st} value={st}>
                          {st.toLowerCase().replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dprReference">DPR reference</Label>
                  {masters && masters.dprMasters.length > 0 ? (
                    <Select
                      value={form.dprReference}
                      onValueChange={(v) => updateField("dprReference", v ?? "")}
                    >
                      <SelectTrigger id="dprReference">
                        <SelectValue placeholder="Select DPR reference" />
                      </SelectTrigger>
                      <SelectContent>
                        {masters.dprMasters.map((d) => (
                          <SelectItem key={d.id} value={d.referenceNumber}>
                            {d.referenceNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="dprReference"
                      value={form.dprReference}
                      onChange={(e) => updateField("dprReference", e.target.value)}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tsAaReference">Ts/Aa reference</Label>
                  {masters && masters.tsAaMasters.length > 0 ? (
                    <Select
                      value={form.tsAaReference}
                      onValueChange={(v) => updateField("tsAaReference", v ?? "")}
                    >
                      <SelectTrigger id="tsAaReference">
                        <SelectValue placeholder="Select TS/AA reference" />
                      </SelectTrigger>
                      <SelectContent>
                        {masters.tsAaMasters.map((t) => (
                          <SelectItem key={t.id} value={t.referenceNumber}>
                            {t.referenceNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="tsAaReference"
                      value={form.tsAaReference}
                      onChange={(e) =>
                        updateField("tsAaReference", e.target.value)
                      }
                    />
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="documents"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="scheduleBAmount">Schedule B amount (₹)</Label>
                  <Input
                    id="scheduleBAmount"
                    type="number"
                    step="0.01"
                    value={form.scheduleBAmount}
                    onChange={(e) =>
                      updateField("scheduleBAmount", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <FileUploadField
                    id="contractors"
                    label="Schedule B document"
                    value={form.scheduleBPath}
                    onChange={(v) => updateField("scheduleBPath", v)}
                    placeholder="Upload Schedule B or enter path"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="raBillDetails">RA bill details</Label>
                  <Textarea
                    id="raBillDetails"
                    value={form.raBillDetails}
                    onChange={(e) =>
                      updateField("raBillDetails", e.target.value)
                    }
                    placeholder="Summary of RA bills, certificates, test copies…"
                    className="min-h-16"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="finalProgressAmount">Final progress amount (₹)</Label>
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

                <div className="space-y-1.5">
                  <Label htmlFor="finalProgressProjectExpense">Final progress project expense (₹)</Label>
                  <Input
                    id="finalProgressProjectExpense"
                    type="number"
                    step="0.01"
                    value={form.finalProgressProjectExpense}
                    onChange={(e) =>
                      updateField(
                        "finalProgressProjectExpense",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <FileUploadField
                    id="contractors"
                    label="Work order copy"
                    value={form.workOrderCopyPath}
                    onChange={(v) => updateField("workOrderCopyPath", v)}
                    placeholder="Upload work order or enter path"
                  />
                </div>

                <div className="space-y-1.5">
                  <FileUploadField
                    id="contractors"
                    label="Drawings"
                    value={form.drawingsPath}
                    onChange={(v) => updateField("drawingsPath", v)}
                    placeholder="Upload drawings or enter path"
                  />
                </div>

                <div className="space-y-1.5">
                  <FileUploadField
                    id="contractors"
                    label="Completion certificate"
                    value={form.completionCertificatePath}
                    onChange={(v) => updateField("completionCertificatePath", v)}
                    placeholder="Upload completion certificate or enter path"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating contractor" : "Editing contractor")} askingAi={askingAi} aiResponse={aiResponse} />

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
              {isEdit ? "Save changes" : "Create contractor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

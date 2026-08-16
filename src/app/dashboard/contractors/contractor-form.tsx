"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Contractor } from "@prisma/client";
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
import { Loader2, FileText, Wrench, Phone, Receipt } from "lucide-react";
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
      workType: "",
      serviceType: "",
      dprReference: "",
      tsAaReference: "",
      scheduleBAmount: "",
      scheduleBPath: "",
      raBillDetails: "",
      raBillsPath: "",
      finalProgressAmount: "",
      finalProgressProjectExpense: "",
      finalProgressPath: "",
      dprDocumentPath: "",
      tsAaDocumentPath: "",
      tenderCopyPath: "",
      contactProofPath: "",
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
    workType: contractor.workType ?? "",
    serviceType: contractor.serviceType ?? "",
    dprReference: contractor.dprReference ?? "",
    tsAaReference: contractor.tsAaReference ?? "",
    scheduleBAmount: toMoneyString(contractor.scheduleBAmount),
    scheduleBPath: contractor.scheduleBPath ?? "",
    raBillDetails: contractor.raBillDetails ?? "",
    raBillsPath: (contractor as any).raBillsPath ?? "",
    finalProgressAmount: toMoneyString(contractor.finalProgressAmount),
    finalProgressProjectExpense: toMoneyString(
      contractor.finalProgressProjectExpense
    ),
    finalProgressPath: (contractor as any).finalProgressPath ?? "",
    dprDocumentPath: (contractor as any).dprDocumentPath ?? "",
    tsAaDocumentPath: (contractor as any).tsAaDocumentPath ?? "",
    tenderCopyPath: (contractor as any).tenderCopyPath ?? "",
    contactProofPath: (contractor as any).contactProofPath ?? "",
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
  const [activeTab, setActiveTab] = useState("contract");
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Handle Contact Master Selection & Auto-fill
  function handleContactMasterSelect(contactId: string | null) {
    if (!contactId || !masters?.contactMasters) return;
    const contact = masters.contactMasters.find((c) => c.id === contactId);
    if (contact) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || contact.name,
        contactPerson: prev.contactPerson || contact.name,
        phone: contact.phone ?? prev.phone,
        email: contact.email ?? prev.email,
        address: contact.address ?? prev.address,
      }));
      toast.info(`Auto-filled contact details from "${contact.name}"`);
    }
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
      raBillsPath: emptyToNull(form.raBillsPath),
      finalProgressAmount: form.finalProgressAmount || null,
      finalProgressProjectExpense: form.finalProgressProjectExpense || null,
      finalProgressPath: emptyToNull(form.finalProgressPath),
      dprDocumentPath: emptyToNull(form.dprDocumentPath),
      tsAaDocumentPath: emptyToNull(form.tsAaDocumentPath),
      tenderCopyPath: emptyToNull(form.tenderCopyPath),
      contactProofPath: emptyToNull(form.contactProofPath),
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

  const title = isEdit ? `Edit Contractor: ${contractor?.name}` : "New Contractor";
  const description = isEdit
    ? "Update contractor work-spec, drawings, and billing information."
    : "Add a contractor profile, work order specifications, and documents.";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="pb-3 border-b">
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">{description}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v ?? "contract")}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-4 mb-3">
              <TabsTrigger value="contract" className="flex items-center gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Contract & Work Order
              </TabsTrigger>
              <TabsTrigger value="technical" className="flex items-center gap-1.5 text-xs">
                <Wrench className="h-3.5 w-3.5" />
                Technical & Drawings
              </TabsTrigger>
              <TabsTrigger value="contact" className="flex items-center gap-1.5 text-xs">
                <Phone className="h-3.5 w-3.5" />
                Contact & Address
              </TabsTrigger>
              <TabsTrigger value="billing" className="flex items-center gap-1.5 text-xs">
                <Receipt className="h-3.5 w-3.5" />
                Billing & Progress (A/c.)
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto pr-1">
              {/* TAB 1: Contract & Work Order */}
              <TabsContent value="contract" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="detailedOrder">Detailed order / Client Authority (A/c.)</Label>
                    {masters && (masters.orderMasters.length > 0 || masters.departments.length > 0) ? (
                      <Select
                        value={form.detailedOrder}
                        onValueChange={(v) => updateField("detailedOrder", v ?? "")}
                      >
                        <SelectTrigger id="detailedOrder">
                          <SelectValue placeholder="Select order master / department" />
                        </SelectTrigger>
                        <SelectContent>
                          {masters.orderMasters.length > 0 && (
                            <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500">Order Master</div>
                          )}
                          {masters.orderMasters.map((o) => (
                            <SelectItem key={`order-${o.id}`} value={o.name}>
                              {o.name}
                            </SelectItem>
                          ))}
                          {masters.departments.length > 0 && (
                            <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500">Departments</div>
                          )}
                          {masters.departments.map((d) => (
                            <SelectItem key={`dept-${d.id}`} value={d.name}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="detailedOrder"
                        value={form.detailedOrder}
                        onChange={(e) => updateField("detailedOrder", e.target.value)}
                        placeholder="e.g. Gujarat Police Housing, RMC"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="workName">Name of work (Work Master)</Label>
                    {masters && masters.workMasters.length > 0 ? (
                      <Select
                        value={form.workName}
                        onValueChange={(v) => updateField("workName", v ?? "")}
                      >
                        <SelectTrigger id="workName">
                          <SelectValue placeholder="Select work category" />
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
                        placeholder="e.g. Road, Water, Building"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="workType">Type of work (Type Master)</Label>
                    <Select
                      value={form.workType || "none"}
                      onValueChange={(v) => updateField("workType", v === "none" ? "" : (v ?? ""))}
                    >
                      <SelectTrigger id="workType">
                        <SelectValue placeholder="Select type from Type Master" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {masters?.typeMasters && masters.typeMasters.length > 0 ? (
                          masters.typeMasters.map((tm) => (
                            <SelectItem key={tm.id} value={tm.name}>
                              {tm.name}
                            </SelectItem>
                          ))
                        ) : (
                          masters?.workMasters.map((wt) => (
                            <SelectItem key={wt.id} value={wt.name}>
                              {wt.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="serviceType">Service type / Type (PMC / TPI)</Label>
                      <div className="flex flex-wrap gap-1">
                        {(masters?.typeMasters && masters.typeMasters.length > 0
                          ? masters.typeMasters.map((m) => m.name)
                          : ["PMC", "TPI", "EPC", "Consultancy", "Supervision"]
                        ).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              updateField("serviceType", t);
                              if (!form.workType) updateField("workType", t);
                            }}
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
                      placeholder="Select PMC/TPI from Type Master above or enter custom"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="tenderId">Tender ID</Label>
                    <Input
                      id="tenderId"
                      value={form.tenderId}
                      onChange={(e) => updateField("tenderId", e.target.value)}
                      placeholder="e.g. Tender ID as per advertisement"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="contractor-tender-copy"
                      label="Tender copy / Advertisement"
                      value={form.tenderCopyPath}
                      onChange={(v) => updateField("tenderCopyPath", v)}
                      accept=".jpg,.jpeg,.png,.pdf"
                      placeholder="Upload tender notice / copy"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contractAmount">Amount of tender approved (₹)</Label>
                    <Input
                      id="contractAmount"
                      type="number"
                      step="0.01"
                      value={form.contractAmount}
                      onChange={(e) => updateField("contractAmount", e.target.value)}
                      placeholder="Contract value in ₹"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="agreementDate">Agreement date</Label>
                    <Input
                      id="agreementDate"
                      type="date"
                      value={form.agreementDate}
                      onChange={(e) => updateField("agreementDate", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="workOrderDate">Work order date</Label>
                    <Input
                      id="workOrderDate"
                      type="date"
                      value={form.workOrderDate}
                      onChange={(e) => updateField("workOrderDate", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="contractor-work-order"
                      label="Work order copy"
                      value={form.workOrderCopyPath}
                      onChange={(v) => updateField("workOrderCopyPath", v)}
                      accept=".jpg,.jpeg,.png,.pdf"
                      placeholder="Upload official work order"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: Technical & Sanctions */}
              <TabsContent value="technical" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="dprReference">DPR reference (DPR Master)</Label>
                    {masters && masters.dprMasters.length > 0 ? (
                      <Select
                        value={form.dprReference}
                        onValueChange={(v) => updateField("dprReference", v ?? "")}
                      >
                        <SelectTrigger id="dprReference">
                          <SelectValue placeholder="Select DPR code" />
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
                        placeholder="e.g. SACE/ELE/MOR/12/072021"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="contractor-dpr-doc"
                      label="DPR document / Report"
                      value={form.dprDocumentPath}
                      onChange={(v) => updateField("dprDocumentPath", v)}
                      accept=".jpg,.jpeg,.png,.pdf"
                      placeholder="Upload approved DPR report"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="tsAaReference">TS/AA reference (TS/AA Master)</Label>
                    {masters && masters.tsAaMasters.length > 0 ? (
                      <Select
                        value={form.tsAaReference}
                        onValueChange={(v) => updateField("tsAaReference", v ?? "")}
                      >
                        <SelectTrigger id="tsAaReference">
                          <SelectValue placeholder="Select TS/AA sanction" />
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
                        onChange={(e) => updateField("tsAaReference", e.target.value)}
                        placeholder="e.g. GSPH/CIVIL/GDL/12-1/072021"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="contractor-tsaa-doc"
                      label="TS/AA approval sanction copy"
                      value={form.tsAaDocumentPath}
                      onChange={(v) => updateField("tsAaDocumentPath", v)}
                      accept=".jpg,.jpeg,.png,.pdf"
                      placeholder="Upload TS/AA sanction copy"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <FileUploadField
                      id="contractor-drawings"
                      label="Engineering & site drawings"
                      value={form.drawingsPath}
                      onChange={(v) => updateField("drawingsPath", v)}
                      accept=".jpg,.jpeg,.png,.pdf,.dwg"
                      placeholder="Upload drawings or layout blueprints"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* TAB 3: Contact & Address */}
              <TabsContent value="contact" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {masters?.contactMasters && masters.contactMasters.length > 0 && (
                    <div className="space-y-1.5 sm:col-span-2 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                      <Label htmlFor="contactMasterSelect" className="text-xs font-semibold text-zinc-700">
                        ⚡ Quick Fill from Contact Master:
                      </Label>
                      <Select onValueChange={handleContactMasterSelect}>
                        <SelectTrigger id="contactMasterSelect" className="bg-white">
                          <SelectValue placeholder="Select a pre-saved contact to auto-fill" />
                        </SelectTrigger>
                        <SelectContent>
                          {masters.contactMasters.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} {c.phone ? `(${c.phone})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="name">Contractor / Firm name</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      placeholder="Registered Contractor Name as per Govt. Info"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contactPerson">Contact person / Representative</Label>
                    <Input
                      id="contactPerson"
                      value={form.contactPerson}
                      onChange={(e) => updateField("contactPerson", e.target.value)}
                      placeholder="e.g. Ramesh Patel (Director)"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone / Mobile (Contact detail)</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="+91 98250 12345"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="contractor@example.com"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="address">Registered office address</Label>
                    <Textarea
                      id="address"
                      value={form.address}
                      onChange={(e) => updateField("address", e.target.value)}
                      placeholder="Full physical / office address"
                      className="min-h-16"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <FileUploadField
                      id="contractor-contact-proof"
                      label="Contact / ID / GST proof"
                      value={form.contactProofPath}
                      onChange={(v) => updateField("contactProofPath", v)}
                      accept=".jpg,.jpeg,.png,.pdf"
                      placeholder="Upload visiting card, letterhead or GST proof"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* TAB 4: Billing, Schedule B & Completion (A/c.) */}
              <TabsContent value="billing" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="scheduleBAmount">Schedule B amount (₹) (A/c.)</Label>
                    <Input
                      id="scheduleBAmount"
                      type="number"
                      step="0.01"
                      value={form.scheduleBAmount}
                      onChange={(e) => updateField("scheduleBAmount", e.target.value)}
                      placeholder="Schedule B approved value"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="contractor-schedule-b"
                      label="Schedule B document (A/c.)"
                      value={form.scheduleBPath}
                      onChange={(v) => updateField("scheduleBPath", v)}
                      accept=".jpg,.jpeg,.png,.pdf,.xls,.xlsx"
                      placeholder="Upload Schedule B file"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="raBillDetails">RA bill details (A/c.)</Label>
                    <Textarea
                      id="raBillDetails"
                      value={form.raBillDetails}
                      onChange={(e) => updateField("raBillDetails", e.target.value)}
                      placeholder="Summary of RA bills, measurement sheets, test copy numbers..."
                      className="min-h-16"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <FileUploadField
                      id="contractor-ra-bills"
                      label="RA bills + certificates + test copies (A/c.)"
                      value={form.raBillsPath}
                      onChange={(v) => updateField("raBillsPath", v)}
                      accept=".jpg,.jpeg,.png,.pdf,.zip"
                      placeholder="Upload all bills, certificates & quality test copies"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="finalProgressAmount">Final progress amount (₹)</Label>
                    <Input
                      id="finalProgressAmount"
                      type="number"
                      step="0.01"
                      value={form.finalProgressAmount}
                      onChange={(e) => updateField("finalProgressAmount", e.target.value)}
                      placeholder="Final work amount in ₹"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="finalProgressProjectExpense">Project expense (₹)</Label>
                    <Input
                      id="finalProgressProjectExpense"
                      type="number"
                      step="0.01"
                      value={form.finalProgressProjectExpense}
                      onChange={(e) => updateField("finalProgressProjectExpense", e.target.value)}
                      placeholder="Total Project Exp in ₹"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <FileUploadField
                      id="contractor-final-progress"
                      label="Final progress format document"
                      value={form.finalProgressPath}
                      onChange={(v) => updateField("finalProgressPath", v)}
                      accept=".jpg,.jpeg,.png,.pdf"
                      placeholder="Upload final progress report"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <FileUploadField
                      id="contractor-completion-cert"
                      label="Completion certificate / Annexure 3 A (A/c.)"
                      value={form.completionCertificatePath}
                      onChange={(v) => updateField("completionCertificatePath", v)}
                      accept=".jpg,.jpeg,.png,.pdf"
                      placeholder="Upload Annexure 3 A completion certificate"
                    />
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <Separator className="my-3" />

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating contractor" : "Editing contractor")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex justify-end gap-2 pt-2">
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

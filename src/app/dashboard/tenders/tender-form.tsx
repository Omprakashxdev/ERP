"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TenderStatus,
  Tender,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { createTender, updateTender } from "@/lib/actions/tender";
import type { MasterData } from "@/lib/master-data";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface TenderFormProps {
  tender?: Tender;
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

function getInitialForm(tender?: Tender) {
  if (!tender) {
    return {
      status: TenderStatus.UNDER_PREPARATION,
      tenderDate: "",
      name: "",
      tenderId: "",
      department: "",
      state: "",
      city: "",
      platform: "",
      workName: "",
      workType: "",
      serviceType: "",
      preBidMeetingDate: "",
      preBidMeetingAttended: false,
      biddingLastDate: "",
      dateOfOpening: "",
      tenderFeeAmount: "",
      tenderFeeDate: "",
      tenderFeeMode: "",
      emdAmount: "",
      emdDate: "",
      emdMode: "",
      emdReturnCollectionDate: "",
      l1ContractorName: "",
      l1City: "",
      l1Amount: "",
      l2ContractorName: "",
      l2City: "",
      l2Amount: "",
      l3ContractorName: "",
      l3City: "",
      l3Amount: "",
      negotiationMeeting: "",
      advertisementCopyPath: "",
      remarks: "",
    };
  }
  return {
    status: tender.status,
    tenderDate: toInputDate(tender.tenderDate),
    name: tender.name,
    tenderId: tender.tenderId ?? "",
    department: tender.department ?? "",
    state: tender.state ?? "",
    city: tender.city ?? "",
    platform: tender.platform ?? "",
    workName: tender.workName ?? "",
    workType: tender.workType ?? "",
    serviceType: tender.serviceType ?? "",
    preBidMeetingDate: toInputDate(tender.preBidMeetingDate),
    preBidMeetingAttended: tender.preBidMeetingAttended,
    biddingLastDate: toInputDate(tender.biddingLastDate),
    dateOfOpening: toInputDate(tender.dateOfOpening),
    tenderFeeAmount: toMoneyString(tender.tenderFeeAmount),
    tenderFeeDate: toInputDate(tender.tenderFeeDate),
    tenderFeeMode: tender.tenderFeeMode ?? "",
    emdAmount: toMoneyString(tender.emdAmount),
    emdDate: toInputDate(tender.emdDate),
    emdMode: tender.emdMode ?? "",
    emdReturnCollectionDate: toInputDate(tender.emdReturnCollectionDate),
    l1ContractorName: tender.l1ContractorName ?? "",
    l1City: tender.l1City ?? "",
    l1Amount: toMoneyString(tender.l1Amount),
    l2ContractorName: tender.l2ContractorName ?? "",
    l2City: tender.l2City ?? "",
    l2Amount: toMoneyString(tender.l2Amount),
    l3ContractorName: tender.l3ContractorName ?? "",
    l3City: tender.l3City ?? "",
    l3Amount: toMoneyString(tender.l3Amount),
    negotiationMeeting: tender.negotiationMeeting ?? "",
    advertisementCopyPath: tender.advertisementCopyPath ?? "",
    remarks: tender.remarks ?? "",
  };
}

export function TenderForm({ tender, mode, masters, onClose }: TenderFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(tender));
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
      status: form.status,
      tenderDate: form.tenderDate || undefined,
      name: form.name,
      tenderId: emptyToNull(form.tenderId),
      department: emptyToNull(form.department),
      state: emptyToNull(form.state),
      city: emptyToNull(form.city),
      platform: emptyToNull(form.platform),
      workName: emptyToNull(form.workName),
      workType: form.workType || null,
      serviceType: form.serviceType || null,
      preBidMeetingDate: form.preBidMeetingDate || null,
      preBidMeetingAttended: form.preBidMeetingAttended,
      biddingLastDate: form.biddingLastDate || null,
      dateOfOpening: form.dateOfOpening || null,
      tenderFeeAmount: form.tenderFeeAmount || null,
      tenderFeeDate: form.tenderFeeDate || null,
      tenderFeeMode: emptyToNull(form.tenderFeeMode),
      emdAmount: form.emdAmount || null,
      emdDate: form.emdDate || null,
      emdMode: emptyToNull(form.emdMode),
      emdReturnCollectionDate: form.emdReturnCollectionDate || null,
      l1ContractorName: emptyToNull(form.l1ContractorName),
      l1City: emptyToNull(form.l1City),
      l1Amount: form.l1Amount || null,
      l2ContractorName: emptyToNull(form.l2ContractorName),
      l2City: emptyToNull(form.l2City),
      l2Amount: form.l2Amount || null,
      l3ContractorName: emptyToNull(form.l3ContractorName),
      l3City: emptyToNull(form.l3City),
      l3Amount: form.l3Amount || null,
      negotiationMeeting: emptyToNull(form.negotiationMeeting),
      advertisementCopyPath: emptyToNull(form.advertisementCopyPath),
      remarks: emptyToNull(form.remarks),
    };

    if (isEdit) {
      return { id: tender!.id, ...base };
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
        ? await updateTender(
            payload as unknown as Parameters<typeof updateTender>[0]
          )
        : await createTender(
            payload as unknown as Parameters<typeof createTender>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save tender.");
        toast.error(result.error ?? "Failed to save tender.");
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

    toast.success(mode === "create" ? "Tender created successfully" : "Tender updated successfully");
    router.refresh();
    onClose();
  }

  const title = isEdit ? "Edit tender" : "New tender";
  const description = isEdit
    ? "Update tender details, timeline, fees, and price comparison."
    : "Record a new tender opportunity and track it through bidding.";

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
              <TabsTrigger value="timeline">Timeline & Fees</TabsTrigger>
              <TabsTrigger value="comparison">Price Comparison</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            <TabsContent
              value="details"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="name">Tender name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Name of tender applied"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      updateField("status", v as TenderStatus)
                    }
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(TenderStatus).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.toLowerCase().replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tenderDate">Tender date</Label>
                  <Input
                    id="tenderDate"
                    type="date"
                    value={form.tenderDate}
                    onChange={(e) => updateField("tenderDate", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tenderId">Tender ID</Label>
                  <Input
                    id="tenderId"
                    value={form.tenderId}
                    onChange={(e) => updateField("tenderId", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="department">Department</Label>
                  {masters && masters.departments.length > 0 ? (
                    <Select
                      value={form.department}
                      onValueChange={(v) => updateField("department", v ?? "")}
                    >
                      <SelectTrigger id="department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {masters.departments.map((d) => (
                          <SelectItem key={d.id} value={d.name}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="department"
                      value={form.department}
                      onChange={(e) => updateField("department", e.target.value)}
                      placeholder="Name of department"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  {masters && masters.states.length > 0 ? (
                    <Select
                      value={form.state}
                      onValueChange={(v) => {
                        updateField("state", v ?? "");
                        updateField("city", "");
                      }}
                    >
                      <SelectTrigger id="state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {masters.states.map((s) => (
                          <SelectItem key={s.id} value={s.name}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="state"
                      value={form.state}
                      onChange={(e) => updateField("state", e.target.value)}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  {masters && masters.cities.length > 0 ? (
                    <Select
                      value={form.city}
                      onValueChange={(v) => updateField("city", v ?? "")}
                    >
                      <SelectTrigger id="city">
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent>
                        {masters.cities
                          .filter((c) => {
                            if (!form.state) return true;
                            if (masters.states.length === 0) return true;
                            const selectedState = masters.states.find((s) => s.name === form.state);
                            if (!selectedState) return false;
                            return c.stateId === selectedState.id;
                          })
                          .map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => updateField("city", e.target.value)}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="platform">Platform</Label>
                  {masters && masters.platforms.length > 0 ? (
                    <Select
                      value={form.platform}
                      onValueChange={(v) => updateField("platform", v ?? "")}
                    >
                      <SelectTrigger id="platform">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {masters.platforms.map((p) => (
                          <SelectItem key={p.id} value={p.name}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="platform"
                      value={form.platform}
                      onChange={(e) => updateField("platform", e.target.value)}
                      placeholder="e.g. npro.gov.in"
                    />
                  )}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="workName">Name of work (Work Master)</Label>
                  {masters?.workMasters && masters.workMasters.length > 0 ? (
                    <Select
                      value={form.workName}
                      onValueChange={(v) => updateField("workName", v || "")}
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
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="workType">Type of work (Type Master)</Label>
                  <Select
                    value={form.workType || "none"}
                    onValueChange={(v) =>
                      updateField("workType", v === "none" ? "" : (v || ""))
                    }
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
                        masters?.workMasters?.map((wt) => (
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
                    <Label htmlFor="serviceType">Service type (PMC / TPI)</Label>
                    <div className="flex flex-wrap gap-1">
                      {["PMC", "TPI", "EPC", "Consultancy"].map((t) => (
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
                    placeholder="e.g. PMC / TPI"
                    onChange={(e) => updateField("serviceType", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="timeline"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="preBidMeetingDate">Pre-bid meeting date</Label>
                  <Input
                    id="preBidMeetingDate"
                    type="date"
                    value={form.preBidMeetingDate}
                    onChange={(e) =>
                      updateField("preBidMeetingDate", e.target.value)
                    }
                  />
                </div>

                <div className="flex items-center space-x-2 pt-6">
                  <input
                    id="preBidMeetingAttended"
                    type="checkbox"
                    checked={form.preBidMeetingAttended}
                    onChange={(e) =>
                      updateField("preBidMeetingAttended", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <label
                    htmlFor="preBidMeetingAttended"
                    className="text-sm font-medium leading-none"
                  >
                    Pre-bid meeting attended
                  </label>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="biddingLastDate">Bidding last date</Label>
                  <Input
                    id="biddingLastDate"
                    type="date"
                    value={form.biddingLastDate}
                    onChange={(e) =>
                      updateField("biddingLastDate", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dateOfOpening">Date of opening</Label>
                  <Input
                    id="dateOfOpening"
                    type="date"
                    value={form.dateOfOpening}
                    onChange={(e) => updateField("dateOfOpening", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tenderFeeAmount">Tender fee amount (₹)</Label>
                  <Input
                    id="tenderFeeAmount"
                    type="number"
                    step="0.01"
                    value={form.tenderFeeAmount}
                    onChange={(e) =>
                      updateField("tenderFeeAmount", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tenderFeeDate">Tender fee date</Label>
                  <Input
                    id="tenderFeeDate"
                    type="date"
                    value={form.tenderFeeDate}
                    onChange={(e) => updateField("tenderFeeDate", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tenderFeeMode">Tender fee mode</Label>
                  <Input
                    id="tenderFeeMode"
                    value={form.tenderFeeMode}
                    onChange={(e) => updateField("tenderFeeMode", e.target.value)
                    }
                    placeholder="e.g. Online / DD"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emdAmount">EMD amount (₹)</Label>
                  <Input
                    id="emdAmount"
                    type="number"
                    step="0.01"
                    value={form.emdAmount}
                    onChange={(e) => updateField("emdAmount", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emdDate">EMD date</Label>
                  <Input
                    id="emdDate"
                    type="date"
                    value={form.emdDate}
                    onChange={(e) => updateField("emdDate", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emdMode">EMD mode</Label>
                  <Input
                    id="emdMode"
                    value={form.emdMode}
                    onChange={(e) => updateField("emdMode", e.target.value)
                    }
                    placeholder="e.g. BG / DD"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emdReturnCollectionDate">EMD return/collection date</Label>
                  <Input
                    id="emdReturnCollectionDate"
                    type="date"
                    value={form.emdReturnCollectionDate}
                    onChange={(e) =>
                      updateField("emdReturnCollectionDate", e.target.value)
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="comparison"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="space-y-6">
                {[
                  { level: "L1", prefix: "l1" },
                  { level: "L2", prefix: "l2" },
                  { level: "L3", prefix: "l3" },
                ].map(({ level, prefix }) => {
                  const nameKey = `${prefix}ContractorName` as keyof typeof form;
                  const cityKey = `${prefix}City` as keyof typeof form;
                  const amountKey = `${prefix}Amount` as keyof typeof form;

                  return (
                    <div key={level} className="space-y-3">
                      <h4 className="text-sm font-medium">{level} dealer</h4>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Contractor name</Label>
                          <Input
                            value={form[nameKey] as string}
                            onChange={(e) =>
                              updateField(nameKey, e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">City</Label>
                          <Input
                            value={form[cityKey] as string}
                            onChange={(e) =>
                              updateField(cityKey, e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Amount (₹)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={form[amountKey] as string}
                            onChange={(e) =>
                              updateField(amountKey, e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="space-y-1.5">
                  <Label htmlFor="negotiationMeeting">Negotiation meeting details</Label>
                  <Textarea
                    id="negotiationMeeting"
                    value={form.negotiationMeeting}
                    onChange={(e) =>
                      updateField("negotiationMeeting", e.target.value)
                    }
                    className="min-h-16"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="documents"
              className="max-h-[55vh] overflow-y-auto py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <FileUploadField
                    id="tender-advertisement"
                    label="Advertisement copy"
                    value={form.advertisementCopyPath}
                    onChange={(v) => updateField("advertisementCopyPath", v)}
                    placeholder="Upload advertisement copy or enter path"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="remarks">Remarks</Label>
                  <Textarea
                    id="remarks"
                    value={form.remarks}
                    onChange={(e) => updateField("remarks", e.target.value)
                    }
                    placeholder="Status notes or follow-up remarks…"
                    className="min-h-16"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating tender" : "Editing tender")} askingAi={askingAi} aiResponse={aiResponse} />

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
              {isEdit ? "Save changes" : "Create tender"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

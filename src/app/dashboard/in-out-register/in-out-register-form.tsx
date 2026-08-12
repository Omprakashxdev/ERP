"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  InOutRegister,
  InOutDirection,
  Client,
  Staff,
  InOutRegisterDocument,
  InOutRegisterCcStaff,
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
  createInOutRegister,
  updateInOutRegister,
} from "@/lib/actions/in-out-register";
import { Loader2, X, Plus, ExternalLink } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface InOutRegisterFormProps {
  entry?: InOutRegister & {
    client?: Client;
    actionSuggestedStaff?: Staff | null;
    documents?: InOutRegisterDocument[];
    ccStaff?: (InOutRegisterCcStaff & { staff?: Staff })[];
  };
  clients: { id: string; name: string }[];
  staff: { id: string; name: string }[];
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

function getInitialForm(
  entry: InOutRegisterFormProps["entry"],
  clients: { id: string; name: string }[]
) {
  if (!entry) {
    return {
      direction: "INWARD" as InOutDirection,
      documentDate: toInputDate(new Date()),
      receivedDate: toInputDate(new Date()),
      documentRefNo: "",
      details: "",
      clientId: clients[0]?.id ?? "",
      actionSuggestedStaffId: "",
      ccStaffIds: [] as string[],
      documents: [] as string[],
      replyDate: "",
      inwardType: "",
      receivedByPersonName: "",
    };
  }
  return {
    direction: entry.direction ?? "INWARD",
    documentDate: toInputDate(entry.documentDate),
    receivedDate: toInputDate(entry.receivedDate),
    documentRefNo: entry.documentRefNo,
    details: entry.details ?? "",
    clientId: entry.clientId,
    actionSuggestedStaffId: entry.actionSuggestedStaffId ?? "",
    ccStaffIds: entry.ccStaff?.map((cs) => cs.staffId) ?? [],
    documents: entry.documents?.map((d) => d.path) ?? [],
    replyDate: toInputDate(entry.replyDate),
    inwardType: (entry as Record<string, unknown>)?.inwardType as string ?? "",
    receivedByPersonName: (entry as Record<string, unknown>)?.receivedByPersonName as string ?? "",
  };
}

export function InOutRegisterForm({
  entry,
  clients,
  staff,
  mode,
  onClose,
}: InOutRegisterFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(entry, clients));
  const [newDocument, setNewDocument] = useState("");
  const [newCcStaffId, setNewCcStaffId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  const documentListRef = useRef<HTMLDivElement>(null);

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    const lastItem = documentListRef.current?.lastElementChild;
    if (lastItem) {
      lastItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [form.documents.length]);

  function removeDocument(index: number) {
    setForm((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));
  }

  function addCcStaff() {
    if (!newCcStaffId) return;
    if (form.ccStaffIds.includes(newCcStaffId)) {
      setNewCcStaffId("");
      return;
    }
    setForm((prev) => ({
      ...prev,
      ccStaffIds: [...prev.ccStaffIds, newCcStaffId],
    }));
    setNewCcStaffId("");
  }

  function removeCcStaff(staffId: string) {
    setForm((prev) => ({
      ...prev,
      ccStaffIds: prev.ccStaffIds.filter((id) => id !== staffId),
    }));
  }

  function buildPayload() {
    const base = {
      direction: form.direction,
      documentDate: form.documentDate || undefined,
      receivedDate: form.receivedDate || undefined,
      documentRefNo: form.documentRefNo,
      details: emptyToNull(form.details),
      clientId: form.clientId,
      actionSuggestedStaffId:
        form.direction === "OUTWARD" ? null : form.actionSuggestedStaffId || null,
      ccStaffIds: form.ccStaffIds.length > 0 ? form.ccStaffIds : undefined,
      documents: form.documents.length > 0 ? form.documents : undefined,
      replyDate: form.direction === "OUTWARD" ? null : form.replyDate || null,
      inwardType: form.direction === "INWARD" && form.inwardType ? form.inwardType : null,
      receivedByPersonName: form.direction === "INWARD" ? emptyToNull(form.receivedByPersonName) : null,
    };

    if (isEdit) {
      return { id: entry!.id, ...base };
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
        ? await updateInOutRegister(
            payload as unknown as Parameters<typeof updateInOutRegister>[0]
          )
        : await createInOutRegister(
            payload as unknown as Parameters<typeof createInOutRegister>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save in-out register entry.");
        toast.error(result.error ?? "Failed to save in-out register entry.");
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

    toast.success("In-out register entry saved successfully");
    router.refresh();
    onClose();
  }

  const isOutward = form.direction === "OUTWARD";
  const title = isEdit
    ? `Edit ${isOutward ? "outward" : "inward"} entry`
    : `New ${isOutward ? "outward" : "inward"} entry`;
  const description = isOutward
    ? "Log a document sent out to a client with CC marking and document paths."
    : "Log an inward document with source, CC marking, and action assignment.";

  const selectedCcStaff = staff.filter((s) => form.ccStaffIds.includes(s.id));

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
              <div className="space-y-1.5">
                <Label htmlFor="direction">Direction</Label>
                <Select
                  value={form.direction}
                  onValueChange={(v) => updateField("direction", v as InOutDirection)}
                >
                  <SelectTrigger id="direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INWARD">Inward</SelectItem>
                    <SelectItem value="OUTWARD">Outward</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="documentDate">Document date</Label>
                <Input
                  id="documentDate"
                  type="date"
                  value={form.documentDate}
                  onChange={(e) =>
                    updateField("documentDate", e.target.value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="receivedDate">{isOutward ? "Sent date" : "Received date"}</Label>
                <Input
                  id="receivedDate"
                  type="date"
                  value={form.receivedDate}
                  onChange={(e) =>
                    updateField("receivedDate", e.target.value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="documentRefNo">Document ref. no</Label>
                <Input
                  id="documentRefNo"
                  value={form.documentRefNo}
                  onChange={(e) =>
                    updateField("documentRefNo", e.target.value)
                  }
                  placeholder="e.g. GMB/XEN/C/BVC/PB/339"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clientId">{isOutward ? "To (client)" : "From (client)"}</Label>
                <Select
                  value={form.clientId}
                  onValueChange={(v) => updateField("clientId", v ?? "")}
                >
                  <SelectTrigger id="clientId">
                    <SelectValue placeholder="Select client">
                      {(value: string) =>
                        clients.find((c) => c.id === value)?.name ?? "Select client"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="details">Details</Label>
                <Textarea
                  id="details"
                  value={form.details}
                  onChange={(e) => updateField("details", e.target.value)}
                  placeholder="Subject or summary of the document"
                  className="min-h-16"
                />
              </div>

              {!isOutward && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="inwardType">Inward type</Label>
                    <Select
                      value={form.inwardType}
                      onValueChange={(v) => updateField("inwardType", v ?? "")}
                    >
                      <SelectTrigger id="inwardType">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">—</SelectItem>
                        <SelectItem value="INFORMATIVE">Informative</SelectItem>
                        <SelectItem value="ACTION_REQUIRED">Action Required</SelectItem>
                        <SelectItem value="COMPLAINT">Complaint</SelectItem>
                        <SelectItem value="QUERY">Query</SelectItem>
                        <SelectItem value="NOTICE">Notice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="receivedByPersonName">Received by (person)</Label>
                    <Input
                      id="receivedByPersonName"
                      value={form.receivedByPersonName}
                      onChange={(e) => updateField("receivedByPersonName", e.target.value)}
                      placeholder="Name of person who received"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="actionSuggestedStaffId">Action suggested to</Label>
                    <Select
                      value={form.actionSuggestedStaffId}
                      onValueChange={(v) =>
                        updateField("actionSuggestedStaffId", v ?? "")
                      }
                    >
                      <SelectTrigger id="actionSuggestedStaffId">
                        <SelectValue placeholder="Select staff">
                          {(value: string) =>
                            value
                              ? staff.find((s) => s.id === value)?.name ?? "Select staff"
                              : "Unassigned"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unassigned</SelectItem>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="replyDate">Reply date</Label>
                    <Input
                      id="replyDate"
                      type="date"
                      value={form.replyDate}
                      onChange={(e) => updateField("replyDate", e.target.value)}
                      min={form.receivedDate || undefined}
                    />
                    {form.replyDate && form.receivedDate && form.replyDate < form.receivedDate && (
                      <p className="text-xs text-red-600">Reply date cannot be before received/sent date</p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <Label>CC marking</Label>
                <div className="flex gap-2">
                  <Select
                    value={newCcStaffId}
                    onValueChange={(v) => setNewCcStaffId(v ?? "")}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select staff to CC">
                        {(value: string) =>
                          staff.find((s) => s.id === value)?.name ?? "Select staff to CC"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addCcStaff}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedCcStaff.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs"
                    >
                      {s.name}
                      <button
                        type="button"
                        onClick={() => removeCcStaff(s.id)}
                        className="rounded p-0.5 hover:bg-zinc-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <FileUploadField
                  id="in-out-register-doc"
                  label="Attach document"
                  value={newDocument}
                  onChange={(path) => {
                    if (path) {
                      setForm((prev) => ({
                        ...prev,
                        documents: [...prev.documents, path],
                      }));
                      setNewDocument("");
                    }
                  }}
                  placeholder="Click browse to attach a document"
                />
                {form.documents.length > 0 && (
                  <div ref={documentListRef} className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                    {form.documents.map((document, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">{document}</span>
                          <a
                            href={withBasePath(document)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-teal-600 hover:text-teal-700 hover:underline shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => removeDocument(index)}
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

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "In-out register entry")} askingAi={askingAi} aiResponse={aiResponse} />

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
              {isEdit ? "Save changes" : "Create entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

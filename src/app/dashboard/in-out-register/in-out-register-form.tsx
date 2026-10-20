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
  getNextRegisterRefNo,
  getInOutRegisterLinkedTasks,
} from "@/lib/actions/in-out-register";
import { Loader2, X, Plus, ExternalLink, Sparkles, Link2, FileText, Lock } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { FileUploadField, documentDisplayName } from "@/components/ui/file-upload-field";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";
import { toInputDateIST, getTodayISTDateString } from "@/lib/date-utils";

interface InOutRegisterFormProps {
  entry?: InOutRegister & {
    client?: Client;
    actionSuggestedStaff?: Staff | null;
    documents?: InOutRegisterDocument[];
    ccStaff?: (InOutRegisterCcStaff & { staff?: Staff })[];
    parentInward?: {
      id: string;
      serialNo?: string | null;
      documentRefNo?: string | null;
      details?: string | null;
    } | null;
  };
  defaultDirection?: InOutDirection;
  parentInward?: {
    id: string;
    serialNo?: string | null;
    documentRefNo?: string | null;
    clientId: string;
    department?: string | null;
    details?: string | null;
  };
  clients: { id: string; name: string }[];
  departments?: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  mode: "create" | "edit";
  onClose: () => void;
}

function toInputDate(value: Date | string | null | undefined): string {
  return toInputDateIST(value);
}

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

function getInitialForm(
  entry: InOutRegisterFormProps["entry"],
  clients: { id: string; name: string }[],
  defaultDirection?: InOutDirection,
  parentInward?: InOutRegisterFormProps["parentInward"]
) {
  if (!entry) {
    const direction = defaultDirection ?? (parentInward ? "OUTWARD" : "INWARD");
    return {
      direction: direction as InOutDirection,
      serialNo: "",
      documentDate: toInputDate(new Date()),
      receivedDate: toInputDate(new Date()),
      documentRefNo: "",
      department: parentInward?.department ?? "",
      details: parentInward
        ? `Re: Inward ${parentInward.serialNo || parentInward.documentRefNo || ""}${parentInward.details ? ` - ${parentInward.details}` : ""}`
        : "",
      clientId: parentInward?.clientId ?? clients[0]?.id ?? "",
      actionSuggestedStaffId: "",
      ccStaffIds: [] as string[],
      documents: [] as string[],
      replyDueDate: "",
      inwardType: "",
      receivedByPersonName: "",
      parentInwardId: parentInward?.id ?? null,
    };
  }
  return {
    direction: entry.direction ?? "INWARD",
    serialNo: (entry as Record<string, unknown>)?.serialNo as string ?? "",
    documentDate: toInputDate(entry.documentDate),
    receivedDate: toInputDate(entry.receivedDate),
    documentRefNo: entry.documentRefNo ?? "",
    department: (entry as Record<string, unknown>)?.department as string ?? "",
    details: entry.details ?? "",
    clientId: entry.clientId,
    actionSuggestedStaffId: entry.actionSuggestedStaffId ?? "",
    ccStaffIds: entry.ccStaff?.map((cs) => cs.staffId) ?? [],
    documents: entry.documents?.map((d) => d.path) ?? [],
    replyDueDate: toInputDate((entry as Record<string, unknown>)?.replyDueDate as Date | null | undefined),
    inwardType: (entry as Record<string, unknown>)?.inwardType as string ?? "",
    receivedByPersonName: (entry as Record<string, unknown>)?.receivedByPersonName as string ?? "",
    parentInwardId: (entry as Record<string, unknown>)?.parentInwardId as string ?? null,
  };
}

export function InOutRegisterForm({
  entry,
  defaultDirection,
  parentInward,
  clients,
  departments,
  staff,
  mode,
  onClose,
}: InOutRegisterFormProps) {
  const router = useRouter();
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(() =>
    getInitialForm(entry, clients, defaultDirection, parentInward)
  );
  const [loadingRefNo, setLoadingRefNo] = useState(false);
  const [newDocument, setNewDocument] = useState("");
  const [newCcStaffId, setNewCcStaffId] = useState("");
  const documentListRef = useRef<HTMLDivElement>(null);
  const isEdit = mode === "edit" && Boolean(entry);

  function updateField<K extends keyof ReturnType<typeof getInitialForm>>(
    field: K,
    value: ReturnType<typeof getInitialForm>[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  const fetchNextRefNo = async (dir: InOutDirection, dateVal?: string) => {
    setLoadingRefNo(true);
    try {
      const res = await getNextRegisterRefNo(dir, dateVal);
      if (res.success && res.data?.refNo) {
        updateField("serialNo", res.data.refNo);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRefNo(false);
    }
  };

  useEffect(() => {
    if (!isEdit && !form.serialNo) {
      fetchNextRefNo(form.direction, form.documentDate);
    }
  }, [isEdit]);

  const handleDirectionChange = (newDir: InOutDirection) => {
    updateField("direction", newDir);
    fetchNextRefNo(newDir, form.documentDate);
  };

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
      serialNo: emptyToNull(form.serialNo),
      documentDate: form.documentDate || undefined,
      receivedDate: form.receivedDate || undefined,
      documentRefNo: emptyToNull(form.documentRefNo),
      department: emptyToNull(form.department),
      replyDueDate:
        form.direction === "INWARD" && form.replyDueDate
          ? new Date(form.replyDueDate)
          : null,
      details: emptyToNull(form.details),
      clientId: form.clientId,
      actionSuggestedStaffId:
        form.direction === "OUTWARD" ? null : form.actionSuggestedStaffId || null,
      ccStaffIds: form.ccStaffIds.length > 0 ? form.ccStaffIds : undefined,
      documents: form.documents.length > 0 ? form.documents : undefined,
      inwardType: form.direction === "INWARD" && form.inwardType ? form.inwardType : null,
      receivedByPersonName: form.direction === "INWARD" ? emptyToNull(form.receivedByPersonName) : null,
      parentInwardId: form.parentInwardId || null,
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

    if (
      form.replyDueDate &&
      form.documentDate &&
      form.replyDueDate < form.documentDate
    ) {
      setError("Reply due date cannot be before the document date.");
      setSubmitting(false);
      return;
    }

    // Frontend validation: dates cannot be in the future (compared using local date)
    const today = toInputDate(new Date());
    if (form.documentDate && form.documentDate > today) {
      setError("Document date cannot be in the future.");
      setSubmitting(false);
      return;
    }
    if (form.receivedDate && form.receivedDate > today) {
      setError("Received/Sent date cannot be in the future.");
      setSubmitting(false);
      return;
    }


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
  const linkedInward = parentInward || entry?.parentInward;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {linkedInward && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between text-xs text-emerald-950">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Linked to Inward Letter: <strong className="font-semibold">{linkedInward.documentRefNo}</strong>
                {linkedInward.details && <span className="text-emerald-700 ml-1">({linkedInward.details})</span>}
              </span>
            </div>
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
              Outward Reply
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="direction">Direction</Label>
                  <span className="text-xs text-zinc-500 font-medium">
                    {isOutward ? "Outward Dispatch" : "Inward Register"}
                  </span>
                </div>
                <Select
                  value={form.direction}
                  disabled
                >
                  <SelectTrigger id="direction" className="opacity-90 bg-zinc-50 cursor-not-allowed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isOutward ? (
                      <SelectItem value="OUTWARD">Outward</SelectItem>
                    ) : (
                      <SelectItem value="INWARD">Inward</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-500">
                  {isOutward
                    ? "Direction is fixed to Outward for dispatch entries."
                    : "Direction is fixed to Inward for received documents."}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="serialNo">
                    Serial No. ({isOutward ? "Outward No" : "Inward No"})
                  </Label>
                  <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded font-medium flex items-center gap-1 border border-zinc-200/60">
                    <Lock className="h-3 w-3 text-zinc-400" />
                    Auto-generated
                  </span>
                </div>
                <Input
                  id="serialNo"
                  value={form.serialNo || (loadingRefNo ? "Generating..." : "")}
                  disabled
                  readOnly
                  tabIndex={-1}
                  placeholder={loadingRefNo ? "Generating serial number..." : (isOutward ? "e.g. OUT/2026-27/001" : "e.g. INW/2026-27/001")}
                  className="font-mono font-semibold text-zinc-700 bg-zinc-100/90 border-zinc-200 cursor-not-allowed select-none opacity-90"
                />
                <p className="text-xs text-zinc-500">
                  System-assigned register serial number (locked — cannot be edited).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="documentRefNo">
                  {isOutward ? "Outgoing Document Ref. No" : "Incoming Document Ref. No"}
                </Label>
                <Input
                  id="documentRefNo"
                  value={form.documentRefNo}
                  onChange={(e) =>
                    updateField("documentRefNo", e.target.value)
                  }
                  placeholder={isOutward ? "e.g. SAEC/OUT/2026/101 (filled by employee)" : "e.g. SMC/HEALTH/2026/142 (filled by employee)"}
                />
                <p className="text-xs text-zinc-500">
                  {isOutward
                    ? "Outgoing letter or client reference number to be filled by employee (optional)."
                    : "The reference number printed on received letter to be filled by employee (leave blank if none)."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="documentDate">Document date</Label>
                <Input
                  id="documentDate"
                  type="date"
                  value={form.documentDate}
                  max={getTodayISTDateString()}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    updateField("documentDate", newDate);
                    if (!isEdit && newDate) {
                      fetchNextRefNo(form.direction, newDate);
                    }
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="receivedDate">{isOutward ? "Sent date" : "Received date"}</Label>
                <Input
                  id="receivedDate"
                  type="date"
                  value={form.receivedDate}
                  max={getTodayISTDateString()}
                  onChange={(e) =>
                    updateField("receivedDate", e.target.value)
                  }
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

              <div className="space-y-1.5">
                <Label htmlFor="department">
                  {isOutward ? "To Department / Division" : "From Department / Division"}
                </Label>
                <Input
                  id="department"
                  list="department-suggestions"
                  value={form.department}
                  onChange={(e) => updateField("department", e.target.value)}
                  placeholder="e.g. Regional Office Rajkot / Town Planning"
                />
                {departments && departments.length > 0 && (
                  <datalist id="department-suggestions">
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.name} />
                    ))}
                  </datalist>
                )}
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="replyDueDate" className="text-amber-900 font-semibold flex items-center gap-1.5">
                        Reply Due Date (Deadline)
                      </Label>
                      <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">Target Deadline</span>
                    </div>
                    <Input
                      id="replyDueDate"
                      type="date"
                      value={form.replyDueDate}
                      onChange={(e) => updateField("replyDueDate", e.target.value)}
                      min={form.documentDate || undefined}
                      className="border-amber-300 focus-visible:ring-amber-500"
                    />
                    <p className="text-xs text-zinc-500">
                      When must the reply be submitted by? (Stays Pending until answered)
                    </p>
                    {form.replyDueDate && form.documentDate && form.replyDueDate < form.documentDate && (
                      <p className="text-xs text-red-600">Due date cannot be before document date</p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="in-out-register-cc-marking">CC marking</Label>
                <div className="flex gap-2">
                  <Select
                    value={newCcStaffId}
                    onValueChange={(v) => setNewCcStaffId(v ?? "")}
                  >
                    <SelectTrigger id="in-out-register-cc-marking" className="flex-1">
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
                          <span className="font-mono text-zinc-500 font-medium shrink-0">
                            {index + 1}.
                          </span>
                          <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                          <span className="truncate" title={documentDisplayName(document)}>
                            {documentDisplayName(document)}
                          </span>
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

          {isEdit && entry && (
            <InOutLinkedTasksPanel inOutRegisterId={entry.id} />
          )}

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
              {isEdit ? "Save Changes" : "Create Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Follow-up tasks already linked to this correspondence. */
function InOutLinkedTasksPanel({ inOutRegisterId }: { inOutRegisterId: string }) {
  const [tasks, setTasks] = useState<
    | {
        id: string;
        title: string;
        status: string;
        dueDate: string | Date | null;
        assignedTo: { name: string } | null;
      }[]
    | null
  >(null);

  useEffect(() => {
    getInOutRegisterLinkedTasks(inOutRegisterId).then((res) => {
      setTasks(res.success ? (res.data as never) : []);
    });
  }, [inOutRegisterId]);

  if (!tasks || tasks.length === 0) return null;

  return (
    <div className="space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <Label className="text-xs">Linked follow-up tasks</Label>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{t.title}</span>
            <span className="text-xs text-zinc-500">
              {t.dueDate
                ? `due ${new Date(t.dueDate).toLocaleDateString("en-IN")}`
                : "no date"}
              {" · "}
              {t.status.replace(/_/g, " ").toLowerCase()}
              {t.assignedTo?.name ? ` · ${t.assignedTo.name}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500">
        Track progress and approval in the Tasks module.
      </p>
    </div>
  );
}

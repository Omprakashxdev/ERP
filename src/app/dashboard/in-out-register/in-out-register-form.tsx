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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  createInOutRegister,
  updateInOutRegister,
  getNextRegisterRefNo,
  getInOutRegisterLinkedTasks,
} from "@/lib/actions/in-out-register";
import { Loader2, X, Plus, ExternalLink, Sparkles, Link2, FileText, Lock, Eye, Download, Check, ChevronsUpDown } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { FileUploadField, documentDisplayName } from "@/components/ui/file-upload-field";
import { PdfPreviewDialog } from "@/components/pdf-preview-dialog";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";
import { toInputDateIST, getTodayISTDateString } from "@/lib/date-utils";

interface InOutRegisterFormProps {
  entry?: InOutRegister & {
    client?: Client;
    actionSuggestedStaff?: Staff | null;
    receivedByStaff?: { id: string; name: string; isActive: boolean } | null;
    mode?: { id: string; name: string; isActive: boolean } | null;
    documents?: InOutRegisterDocument[];
    ccStaff?: (InOutRegisterCcStaff & { staff?: Staff })[];
    parentInward?: {
      id: string;
      serialNo?: string | null;
      documentRefNo?: string | null;
      details?: string | null;
      project?: { id: string; name: string } | null;
    } | null;
    project?: { id: string; name: string; abbreviation?: string | null } | null;
  };
  defaultDirection?: InOutDirection;
  parentInward?: {
    id: string;
    serialNo?: string | null;
    documentRefNo?: string | null;
    clientId: string;
    department?: string | null;
    details?: string | null;
    project?: { id: string; name: string } | null;
  };
  clients: { id: string; name: string }[];
  projects?: { id: string; name: string; abbreviation?: string | null; clientId: string }[];
  departments?: { id: string; name: string }[];
  staff: { id: string; name: string; employeeCode?: string | null }[];
  allStaff?: { id: string; name: string; employeeCode?: string | null; isActive: boolean }[];
  modes?: { id: string; name: string }[];
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
      modeId: "",
      letterPad: "",
      ccStaffIds: [] as string[],
      documents: [] as string[],
      replyDueDate: "",
      inwardType: "",
      receivedByPersonName: "",
      receivedByStaffId: "",
      parentInwardId: parentInward?.id ?? null,
      projectId: "",
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
    modeId: entry.modeId ?? "",
    letterPad: (entry as Record<string, unknown>)?.letterPad as string ?? "",
    ccStaffIds: entry.ccStaff?.map((cs) => cs.staffId) ?? [],
    documents: entry.documents?.map((d) => d.path) ?? [],
    replyDueDate: toInputDate((entry as Record<string, unknown>)?.replyDueDate as Date | null | undefined),
    inwardType: (entry as Record<string, unknown>)?.inwardType as string ?? "",
    receivedByPersonName: (entry as Record<string, unknown>)?.receivedByPersonName as string ?? "",
    receivedByStaffId: (entry as Record<string, unknown>)?.receivedByStaffId as string ?? "",
    parentInwardId: (entry as Record<string, unknown>)?.parentInwardId as string ?? null,
    projectId: (entry as Record<string, unknown>)?.projectId as string ?? "",
  };
}

export function InOutRegisterForm({
  entry,
  defaultDirection,
  parentInward,
  clients,
  projects = [],
  departments,
  staff,
  allStaff,
  modes = [],
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
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [receiverPickerOpen, setReceiverPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    documentRefNo?: string;
    actionSuggestedStaffId?: string;
  }>({});
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

  const initialInwardType =
    (entry as Record<string, unknown> | undefined)?.inwardType as
      | string
      | null
      | undefined;

  function buildPayload() {
    // Reply Due Date applies only to Action Required inwards. A deadline
    // is cleared only when the user actually changes the type to
    // Informative — an untouched legacy deadline is preserved as saved.
    const inwardTypeNow = form.direction === "INWARD" && form.inwardType ? form.inwardType : null;
    const clearedByTypeChange =
      inwardTypeNow === "INFORMATIVE" && inwardTypeNow !== (initialInwardType ?? null);
    const replyDueDate =
      form.direction !== "INWARD" || clearedByTypeChange
        ? null
        : form.replyDueDate
          ? new Date(form.replyDueDate)
          : null;

    const base = {
      direction: form.direction,
      serialNo: emptyToNull(form.serialNo),
      documentDate: form.documentDate || undefined,
      receivedDate: form.receivedDate || undefined,
      documentRefNo: form.documentRefNo.trim(),
      department: emptyToNull(form.department),
      replyDueDate,
      details: emptyToNull(form.details),
      clientId: form.clientId,
      actionSuggestedStaffId: form.actionSuggestedStaffId || null,
      modeId: form.modeId || null,
      letterPad: emptyToNull(form.letterPad),
      ccStaffIds: form.ccStaffIds.length > 0 ? form.ccStaffIds : undefined,
      documents: form.documents.length > 0 ? form.documents : undefined,
      inwardType: inwardTypeNow,
      receivedByPersonName: form.direction === "INWARD" ? emptyToNull(form.receivedByPersonName) : null,
      receivedByStaffId: form.direction === "INWARD" ? form.receivedByStaffId || null : null,
      parentInwardId: form.parentInwardId || null,
      projectId: form.direction === "INWARD" ? form.projectId || null : null,
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

    const nextFieldErrors: typeof fieldErrors = {};
    if (!form.documentRefNo.trim()) {
      nextFieldErrors.documentRefNo = "Document number is required.";
    }
    if (!form.actionSuggestedStaffId) {
      nextFieldErrors.actionSuggestedStaffId =
        "Select the staff member the action is suggested to.";
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setSubmitting(false);
      return;
    }

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
  // Received-by lists every employee (active selectable, inactive disabled)
  const receiverOptions = allStaff ?? staff.map((s) => ({ ...s, isActive: true }));
  const selectedReceiver = receiverOptions.find((s) => s.id === form.receivedByStaffId);
  const preservedReceiver =
    form.receivedByStaffId && !selectedReceiver ? entry?.receivedByStaff : null;
  // Related Project (inward only) — filtered to the selected client. A
  // saved link to a project outside the loaded list stays visible as a
  // preserved option rather than being silently dropped.
  const clientProjects = projects.filter((p) => p.clientId === form.clientId);
  const selectedProject =
    clientProjects.find((p) => p.id === form.projectId) ??
    projects.find((p) => p.id === form.projectId);
  const preservedProject =
    form.projectId && !selectedProject ? entry?.project : null;
  const projectTriggerLabel = selectedProject
    ? selectedProject.name
    : preservedProject
      ? `${preservedProject.name} (preserved)`
      : null;
  const receiverTriggerLabel = selectedReceiver
    ? `${selectedReceiver.name}${selectedReceiver.employeeCode ? ` (${selectedReceiver.employeeCode})` : ""}${selectedReceiver.isActive ? "" : " (inactive — preserved)"}`
    : preservedReceiver
      ? `${preservedReceiver.name} (inactive — preserved)`
      : !form.receivedByStaffId && form.receivedByPersonName
        ? `${form.receivedByPersonName} (manual entry)`
        : null;
  const linkedInward = parentInward || entry?.parentInward;
  // An outward reply inherits the linked inward's project for display —
  // it is never an editable field on outward entries.
  const linkedProject = isOutward ? (linkedInward?.project ?? null) : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {linkedInward && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-3 text-xs text-emerald-950">
            <div className="flex items-center gap-2 min-w-0">
              <Link2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="min-w-0">
                Linked to Inward Letter: <strong className="font-semibold">{linkedInward.documentRefNo}</strong>
                {linkedInward.details && <span className="text-emerald-700 ml-1">({linkedInward.details})</span>}
                {linkedProject && (
                  <span className="block text-emerald-800 mt-0.5">
                    Related project: <strong className="font-semibold">{linkedProject.name}</strong>
                    <span className="text-emerald-600 ml-1">(from the linked inward — read-only)</span>
                  </span>
                )}
              </span>
            </div>
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium shrink-0">
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
                  <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                </Label>
                <Input
                  id="documentRefNo"
                  value={form.documentRefNo}
                  aria-required="true"
                  onChange={(e) => {
                    updateField("documentRefNo", e.target.value);
                    if (fieldErrors.documentRefNo) {
                      setFieldErrors((p) => ({ ...p, documentRefNo: undefined }));
                    }
                  }}
                  onBlur={() => updateField("documentRefNo", form.documentRefNo.trim())}
                  placeholder={isOutward ? "e.g. SAEC/OUT/2026/101 (filled by employee)" : "e.g. SMC/HEALTH/2026/142 (filled by employee)"}
                />
                {fieldErrors.documentRefNo ? (
                  <p className="text-xs text-red-600">{fieldErrors.documentRefNo}</p>
                ) : (
                  <p className="text-xs text-zinc-500">
                    {isOutward
                      ? "Outgoing letter or client reference number (required — must be unique)."
                      : "The reference number printed on the received letter (required — must be unique)."}
                  </p>
                )}
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
                  onValueChange={(v) => {
                    const next = v ?? "";
                    setForm((prev) => ({
                      ...prev,
                      clientId: next,
                      // A client change clears a project pick that no
                      // longer belongs to the selected client.
                      projectId:
                        prev.projectId &&
                        !projects.some((p) => p.id === prev.projectId && p.clientId === next)
                          ? ""
                          : prev.projectId,
                    }));
                  }}
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

              <div className="space-y-1.5">
                <Label htmlFor="modeId">Mode</Label>
                {modes.length === 0 && !form.modeId ? (
                  <p className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2.5">
                    No active modes available. Add or activate modes in
                    Masters &rarr; Mode Master — this field is optional.
                  </p>
                ) : (
                  <Select
                    value={form.modeId}
                    onValueChange={(v) => updateField("modeId", v === "__none__" ? "" : (v ?? ""))}
                  >
                    <SelectTrigger id="modeId" className="min-h-11 w-full">
                      <SelectValue placeholder="Select mode">
                        {(value: string) =>
                          modes.find((m) => m.id === value)?.name ??
                          entry?.mode?.name ??
                          "Select mode"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {form.modeId && (
                        <SelectItem value="__none__">— (clear)</SelectItem>
                      )}
                      {form.modeId && !modes.some((m) => m.id === form.modeId) && (
                        <SelectItem value={form.modeId} disabled>
                          {entry?.mode?.name ?? "Previously selected mode"}
                          {" "}(inactive — preserved)
                        </SelectItem>
                      )}
                      {modes.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="letterPad">Letter pad</Label>
                <Input
                  id="letterPad"
                  value={form.letterPad}
                  maxLength={200}
                  onChange={(e) => updateField("letterPad", e.target.value)}
                  placeholder="e.g. Head Office / Rajkot branch letterhead"
                />
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
                    <Label htmlFor="projectId">Related Project</Label>
                    <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                      <PopoverTrigger
                        id="projectId"
                        className="inline-flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-700 hover:bg-zinc-50"
                      >
                        <span className={`truncate ${projectTriggerLabel ? "" : "text-zinc-500"}`}>
                          {projectTriggerLabel ?? "General Correspondence / No Project"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] max-w-[90vw] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search project name…" />
                          <CommandList>
                            <CommandEmpty>No project found for this client.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__none__"
                                onSelect={() => {
                                  updateField("projectId", "");
                                  setProjectPickerOpen(false);
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${!form.projectId ? "opacity-100" : "opacity-0"}`}
                                />
                                General Correspondence / No Project
                              </CommandItem>
                              {preservedProject && (
                                <CommandItem value={preservedProject.name} disabled>
                                  <Check className="mr-2 h-4 w-4 opacity-100" />
                                  <span className="min-w-0 flex-1 truncate">
                                    {preservedProject.name}{" "}
                                    <span className="text-xs text-zinc-500">(preserved)</span>
                                  </span>
                                </CommandItem>
                              )}
                              {projects.map((p) => {
                                const matchesClient = p.clientId === form.clientId;
                                const pClient = clients.find((c) => c.id === p.clientId)?.name;
                                return (
                                  <CommandItem
                                    key={p.id}
                                    value={`${p.name} ${p.abbreviation ?? ""} ${pClient ?? ""}`}
                                    disabled={!matchesClient}
                                    onSelect={() => {
                                      if (!matchesClient) return;
                                      updateField("projectId", p.id);
                                      setProjectPickerOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${
                                        form.projectId === p.id ? "opacity-100" : "opacity-0"
                                      }`}
                                    />
                                    <span className={`min-w-0 flex-1 truncate ${matchesClient ? "" : "text-zinc-400"}`}>
                                      {p.name}
                                      {p.abbreviation && (
                                        <span className="ml-1.5 text-xs text-zinc-500">
                                          ({p.abbreviation})
                                        </span>
                                      )}
                                      {!matchesClient && (
                                        <span className="ml-1.5 rounded bg-zinc-100 px-1 py-0.5 text-[10px] text-zinc-500">
                                          {pClient ?? "other client"}
                                        </span>
                                      )}
                                    </span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-zinc-500">
                      {clientProjects.length === 0
                        ? `No projects exist for ${clients.find((c) => c.id === form.clientId)?.name ?? "the selected client"} yet — create one in Masters → Projects, or leave as general correspondence.`
                        : "Pick the project this document concerns, or leave as general correspondence."}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="inwardType">Inward type</Label>
                    <Select
                      value={form.inwardType}
                      onValueChange={(v) => updateField("inwardType", v === "__none__" ? "" : (v ?? ""))}
                    >
                      <SelectTrigger id="inwardType">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {form.inwardType !== "" && (
                          <SelectItem value="__none__">— (clear)</SelectItem>
                        )}
                        <SelectItem value="INFORMATIVE">Informative</SelectItem>
                        <SelectItem value="ACTION_REQUIRED">Action Required</SelectItem>
                        {isEdit &&
                          form.inwardType &&
                          !["INFORMATIVE", "ACTION_REQUIRED"].includes(form.inwardType) && (
                            <SelectItem value={form.inwardType} disabled>
                              {form.inwardType.charAt(0) +
                                form.inwardType.slice(1).toLowerCase().replace(/_/g, " ")}{" "}
                              (legacy — cannot be reassigned)
                            </SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="receivedByStaffId">Received by (employee)</Label>
                    {receiverOptions.length === 0 ? (
                      <p className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2.5">
                        No employees available — add staff in Masters to link
                        this field. Manual entries on old records stay visible.
                      </p>
                    ) : (
                      <>
                        <Popover open={receiverPickerOpen} onOpenChange={setReceiverPickerOpen}>
                          <PopoverTrigger
                            id="receivedByStaffId"
                            className="inline-flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-700 hover:bg-zinc-50"
                          >
                            <span className={`truncate ${receiverTriggerLabel ? "" : "text-zinc-500"}`}>
                              {receiverTriggerLabel ?? "Select employee…"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] max-w-[90vw] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search employee name or code…" />
                              <CommandList>
                                <CommandEmpty>No employee found.</CommandEmpty>
                                <CommandGroup>
                                  {form.receivedByStaffId && (
                                    <CommandItem
                                      value="__none__"
                                      onSelect={() => {
                                        updateField("receivedByStaffId", "");
                                        setReceiverPickerOpen(false);
                                      }}
                                    >
                                      — (clear)
                                    </CommandItem>
                                  )}
                                  {preservedReceiver && (
                                    <CommandItem value={preservedReceiver.name} disabled>
                                      <Check className="mr-2 h-4 w-4 opacity-100" />
                                      <span className="min-w-0 flex-1 truncate">
                                        {preservedReceiver.name}{" "}
                                        <span className="text-xs text-zinc-500">(inactive — preserved)</span>
                                      </span>
                                    </CommandItem>
                                  )}
                                  {receiverOptions.map((s) => (
                                    <CommandItem
                                      key={s.id}
                                      value={`${s.name} ${s.employeeCode ?? ""}`}
                                      disabled={!s.isActive}
                                      onSelect={() => {
                                        if (!s.isActive) return;
                                        updateField("receivedByStaffId", s.id);
                                        setReceiverPickerOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${
                                          form.receivedByStaffId === s.id ? "opacity-100" : "opacity-0"
                                        }`}
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span className={`block truncate text-sm ${s.isActive ? "text-zinc-800" : "text-zinc-400"}`}>
                                          {s.name}
                                          {!s.isActive && (
                                            <span className="ml-1.5 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium uppercase text-zinc-500">
                                              Inactive
                                            </span>
                                          )}
                                        </span>
                                        {s.employeeCode && (
                                          <span className="block truncate text-xs text-zinc-500">
                                            {s.employeeCode}
                                          </span>
                                        )}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {!form.receivedByStaffId && form.receivedByPersonName && (
                          <p className="text-xs text-zinc-500">
                            Manual entry from before this field was added — preserved.
                            Pick an employee to link, or leave as is.
                          </p>
                        )}
                        {form.receivedByStaffId && form.receivedByPersonName && (
                          <p className="text-xs text-zinc-500">
                            Also recorded manually: {form.receivedByPersonName}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {form.inwardType === "ACTION_REQUIRED" && (
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
                  )}
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="actionSuggestedStaffId">
                  Action suggested to
                  <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                </Label>
                {staff.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    No staff members are available to assign. Add staff in
                    Masters before saving this entry.
                  </p>
                ) : (
                  <Select
                    value={form.actionSuggestedStaffId}
                    onValueChange={(v) => {
                      updateField("actionSuggestedStaffId", v ?? "");
                      if (fieldErrors.actionSuggestedStaffId) {
                        setFieldErrors((p) => ({ ...p, actionSuggestedStaffId: undefined }));
                      }
                    }}
                  >
                    <SelectTrigger id="actionSuggestedStaffId">
                      <SelectValue placeholder="Select staff (required)">
                        {(value: string) =>
                          staff.find((s) => s.id === value)?.name ?? "Select staff (required)"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {form.actionSuggestedStaffId &&
                        !staff.some((s) => s.id === form.actionSuggestedStaffId) && (
                          <SelectItem value={form.actionSuggestedStaffId} disabled>
                            {entry?.actionSuggestedStaff?.name ?? "Previously assigned staff"}
                            {" "}(inactive — preserved)
                          </SelectItem>
                        )}
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {fieldErrors.actionSuggestedStaffId && (
                  <p className="text-xs text-red-600">{fieldErrors.actionSuggestedStaffId}</p>
                )}
              </div>

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
                  uploadEndpoint="/api/in-out-documents"
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
                  <div ref={documentListRef} className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                    {form.documents.map((document, index) => {
                      const isPdf = document.toLowerCase().endsWith(".pdf");
                      const viewUrl = withBasePath(
                        `/api/in-out-documents?path=${encodeURIComponent(document)}`
                      );
                      const downloadUrl = `${viewUrl}&download=1`;
                      return (
                        <div
                          key={index}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="font-mono text-zinc-500 font-medium shrink-0">
                              {index + 1}.
                            </span>
                            <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                            <span
                              className="truncate text-sm"
                              title={documentDisplayName(document)}
                            >
                              {documentDisplayName(document)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {isPdf ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="min-h-9 gap-1 px-2.5 text-xs"
                                onClick={() => setPreviewPath(document)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View PDF
                              </Button>
                            ) : (
                              <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="min-h-9 gap-1 px-2.5 text-xs"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  View
                                </Button>
                              </a>
                            )}
                            <a
                              href={downloadUrl}
                              download={documentDisplayName(document)}
                              title="Download document"
                            >
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="min-h-9 gap-1 px-2.5 text-xs"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </Button>
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="min-h-9 w-9 p-0"
                              onClick={() => removeDocument(index)}
                              title="Remove document"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
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
            <Button type="submit" disabled={submitting || staff.length === 0}>
              {submitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {isEdit ? "Save Changes" : "Create Entry"}
            </Button>
          </div>
        </form>
        <PdfPreviewDialog
          documentPath={previewPath}
          open={previewPath !== null}
          onOpenChange={(open) => {
            if (!open) setPreviewPath(null);
          }}
        />
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

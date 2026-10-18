"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  createTask,
  updateTask,
  performTaskTransition,
  getTaskAttachments,
} from "@/lib/actions/task-management";
import { withBasePath } from "@/lib/base-path";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface StaffOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

const priorityLabels: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

function toInputDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TaskFormDialog({ staff, projects }: { staff: StaffOption[]; projects?: ProjectOption[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { error, setError, clearError, askAi, askingAi, aiResponse } = useErrorHandler();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [department, setDepartment] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await createTask({
        title,
        description: description || undefined,
        assignedToId,
        reviewerId: reviewerId || undefined,
        projectId: projectId || undefined,
        priority: priority as never,
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        department: department || undefined,
      } as never);

      if (res.success) {
        toast.success("Task created successfully");
        setOpen(false);
        window.location.reload();
      } else {
        setError(res.error ?? "Failed to create task");
        toast.error(res.error ?? "Failed to create task");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Task
        </Button>
      } />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Assign To</Label>
              <Select value={assignedToId} onValueChange={(v) => setAssignedToId(v ?? "")}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="Select staff">
                    {(value: string) =>
                      staff.find((s) => s.id === value)?.name ?? "Select staff"
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v ?? "MEDIUM")}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue>
                    {(value: string) => priorityLabels[value] ?? value}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {projects && projects.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Project (optional)</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="No project">
                    {(value: string) =>
                      value
                        ? projects?.find((p) => p.id === value)?.name ?? "No project"
                        : "No project"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Department (optional)</Label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Civil, Electrical"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reviewer (optional)</Label>
              <Select value={reviewerId} onValueChange={(v) => setReviewerId(v ?? "")}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="No reviewer">
                    {(value: string) =>
                      value
                        ? staff.find((s) => s.id === value)?.name ?? "No reviewer"
                        : "No reviewer"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No reviewer</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                min={toInputDate(new Date())}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Creating a task")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface TaskEditData {
  id: string;
  title: string;
  description: string | null;
  assignedToId: string;
  reviewerId: string | null;
  projectId: string | null;
  priority: string;
  startDate: Date | null;
  dueDate: Date | null;
  status: string;
  department: string | null;
  percentageCompletion: number | null;
}

export function TaskEditForm({
  task,
  staff,
  projects,
  onClose,
}: {
  task: TaskEditData;
  staff: StaffOption[];
  projects?: ProjectOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, clearError, askAi, askingAi, aiResponse } = useErrorHandler();

  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? "",
    assignedToId: task.assignedToId,
    reviewerId: task.reviewerId ?? "",
    projectId: task.projectId ?? "",
    priority: task.priority,
    startDate: toInputDate(task.startDate),
    dueDate: toInputDate(task.dueDate),
    department: task.department ?? "",
    percentageCompletion: task.percentageCompletion ?? 0,
  });

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await updateTask({
        id: task.id,
        title: form.title,
        description: form.description || undefined,
        assignedToId: form.assignedToId,
        reviewerId: form.reviewerId || undefined,
        projectId: form.projectId || undefined,
        priority: form.priority as never,
        startDate: form.startDate ? new Date(form.startDate) : null,
        dueDate: form.dueDate ? new Date(form.dueDate) : null,
        department: form.department || undefined,
        percentageCompletion: form.percentageCompletion,
      } as never);

      if (!res.success) {
        setError(res.error ?? "Failed to update task");
        toast.error(res.error ?? "Failed to update task");
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

    toast.success("Task updated successfully");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>Update task details</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Assign To</Label>
                <Select
                  value={form.assignedToId}
                  onValueChange={(v) => updateField("assignedToId", v ?? "")}
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="Select staff">
                      {(value: string) =>
                        staff.find((s) => s.id === value)?.name ?? "Select staff"
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
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => updateField("priority", v ?? "MEDIUM")}
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue>
                      {(value: string) => priorityLabels[value] ?? value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {projects && projects.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <Select
                  value={form.projectId}
                  onValueChange={(v) => updateField("projectId", v ?? "")}
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="No project">
                      {(value: string) =>
                        value
                          ? projects?.find((p) => p.id === value)?.name ?? "No project"
                          : "No project"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <Input
                  value={form.department}
                  onChange={(e) => updateField("department", e.target.value)}
                  placeholder="e.g. Civil, Electrical"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reviewer</Label>
                <Select
                  value={form.reviewerId}
                  onValueChange={(v) => updateField("reviewerId", v ?? "")}
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="No reviewer">
                      {(value: string) =>
                        value
                          ? staff.find((s) => s.id === value)?.name ?? "No reviewer"
                          : "No reviewer"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No reviewer</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Percentage Completion: {form.percentageCompletion}%</Label>
              <Input
                type="range"
                min="0"
                max="100"
                step="5"
                value={form.percentageCompletion}
                onChange={(e) => updateField("percentageCompletion", Number(e.target.value))}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => updateField("startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => updateField("dueDate", e.target.value)}
              />
            </div>
          </div>

          <TaskAttachments taskId={task.id} />

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Editing a task")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex justify-end gap-2 pt-3">
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
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TaskStatusActions({
  task,
  currentStaffId,
  currentUserId,
  role,
  onClose,
}: {
  task: {
    id: string;
    status: string;
    assignedToId: string;
    assignedById: string | null;
    reviewerId: string | null;
    percentageCompletion: number;
  };
  currentStaffId: string | null;
  currentUserId: string;
  role: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  const [reworkReason, setReworkReason] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(task.percentageCompletion ?? 0);
  const [progressNote, setProgressNote] = useState("");

  const isAssignee = currentStaffId != null && task.assignedToId === currentStaffId;
  const isReviewer = currentStaffId != null && task.reviewerId === currentStaffId;
  const isAssigner = task.assignedById === currentUserId;
  const isAdmin = role === "ADMIN";
  const canManage = isAdmin || role === "MANAGER";
  const isSelfWork = isAssignee && !isAdmin;

  async function run(action: Parameters<typeof performTaskTransition>[0]["action"], extra?: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    const res = await performTaskTransition({
      id: task.id,
      action,
      ...extra,
    } as never);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error ?? "Action failed");
      toast.error(res.error ?? "Action failed");
      return;
    }
    toast.success("Task updated");
    router.refresh();
    onClose();
  }

  const status = task.status;
  const actions: { label: string; run: () => void; variant: "default" | "outline" | "destructive" }[] = [];

  if (status === "OPEN") {
    if (isAssignee || canManage)
      actions.push({ label: "Accept task", run: () => run("accept"), variant: "default" });
    if (canManage || isAssigner)
      actions.push({ label: "Cancel task", run: () => run("cancel"), variant: "destructive" });
  } else if (status === "IN_PROGRESS") {
    if (isAssignee || canManage) {
      actions.push({ label: "Update progress", run: () => setShowProgress(true), variant: "outline" });
      actions.push({ label: "Submit for review", run: () => run("submitForReview"), variant: "default" });
      actions.push({ label: "Put on hold", run: () => run("hold"), variant: "outline" });
    }
    if (canManage || isAssigner)
      actions.push({ label: "Cancel task", run: () => run("cancel"), variant: "destructive" });
  } else if (status === "ON_HOLD") {
    if (isAssignee || canManage)
      actions.push({ label: "Resume task", run: () => run("resume"), variant: "default" });
    if (canManage || isAssigner)
      actions.push({ label: "Cancel task", run: () => run("cancel"), variant: "destructive" });
  } else if (status === "PENDING_REVIEW") {
    if ((isReviewer || isAdmin) && !isSelfWork) {
      actions.push({ label: "Approve", run: () => run("approve"), variant: "default" });
      actions.push({
        label: "Request changes",
        run: () => {
          if (!reworkReason.trim()) {
            setError("Please explain what needs changing.");
            return;
          }
          run("requestRework", { reworkReason: reworkReason.trim() });
        },
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Task actions</DialogTitle>
          <DialogDescription>
            Current status:{" "}
            <span className="font-medium">{status.replace(/_/g, " ").toLowerCase()}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {showProgress && (
            <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <Label className="text-xs">Progress — {progress}%</Label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full"
              />
              <Label className="text-xs">Note (optional)</Label>
              <Input
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
                placeholder="What was done?"
              />
              <Button
                size="sm"
                disabled={submitting}
                onClick={() =>
                  run("updateProgress", {
                    percentageCompletion: progress,
                    note: progressNote.trim() || undefined,
                  })
                }
              >
                Save progress
              </Button>
            </div>
          )}

          {status === "PENDING_REVIEW" && (isReviewer || isAdmin) && !isSelfWork && (
            <div className="space-y-1">
              <Label className="text-xs">Reason for changes (required to send back)</Label>
              <Textarea
                value={reworkReason}
                onChange={(e) => setReworkReason(e.target.value)}
                rows={2}
                placeholder="Explain what needs correction…"
              />
            </div>
          )}

          {actions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No actions are available for you on this task.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button
                  key={a.label}
                  variant={a.variant}
                  size="sm"
                  className="h-9"
                  disabled={submitting}
                  onClick={a.run}
                >
                  {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {a.label}
                </Button>
              ))}
            </div>
          )}

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Task status change")} askingAi={askingAi} aiResponse={aiResponse} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Task attachments panel — list, download, upload. Record-level
    authorization is enforced server-side; a 403 just hides the panel. */
function TaskAttachments({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<
    { id: string; filename: string; size: number | null }[] | null
  >(null);
  const [denied, setDenied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await getTaskAttachments(taskId);
    if (!res.success) {
      setDenied(true);
      return;
    }
    setItems(res.data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("taskId", taskId);
      const res = await fetch(withBasePath("/api/task-files"), {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await load();
      toast.success("File attached");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (denied) return null;

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3">
      <Label className="text-xs">Attachments</Label>
      {items && items.length === 0 && (
        <p className="text-xs text-zinc-500">No files attached yet.</p>
      )}
      {items && items.length > 0 && (
        <ul className="space-y-1">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <a
                href={withBasePath(`/api/task-files/${a.id}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline underline-offset-2"
              >
                {a.filename}
              </a>
              {a.size != null && (
                <span className="text-xs text-zinc-400">
                  ({Math.max(1, Math.round(a.size / 1024))} KB)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          onChange={onFile}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Attach a file
        </Button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}

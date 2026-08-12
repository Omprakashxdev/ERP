"use client";

import { useState } from "react";
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
import { createTask, updateTask } from "@/lib/actions/task-management";
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

          <div className="space-y-1">
            <Label className="text-xs">Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              min={toInputDate(new Date())}
              onChange={(e) => setDueDate(e.target.value)}
            />
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
              <Label className="text-xs">Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => updateField("dueDate", e.target.value)}
              />
            </div>
          </div>

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
  taskId,
  status,
  onClose,
}: {
  taskId: string;
  status: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  const [reworkReason, setReworkReason] = useState("");

  async function handleStatusChange(
    newStatus: "IN_PROGRESS" | "ON_HOLD" | "PENDING_REVIEW" | "COMPLETED" | "CANCELLED"
  ) {
    setSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      id: taskId,
      status: newStatus,
    };

    if (newStatus === "PENDING_REVIEW") {
      payload.reworkReason = reworkReason || undefined;
    }

    const res = await updateTask(payload as never);

    setSubmitting(false);

    if (!res.success) {
      setError(res.error ?? "Failed to update status");
      toast.error(res.error ?? "Failed to update status");
      return;
    }

    toast.success("Task status updated");
    router.refresh();
    onClose();
  }

  async function handleRework() {
    setSubmitting(true);
    setError(null);

    const res = await updateTask({
      id: taskId,
      status: "IN_PROGRESS",
      reworkReason: reworkReason || undefined,
    } as never);

    setSubmitting(false);

    if (!res.success) {
      setError(res.error ?? "Failed to send back for rework");
      toast.error(res.error ?? "Failed to send back for rework");
      return;
    }

    toast.success("Task sent back for rework");
    router.refresh();
    onClose();
  }

  const actions: { label: string; action: () => void; variant: "default" | "outline" | "destructive" }[] = [];

  if (status === "OPEN") {
    actions.push({ label: "Start (In Progress)", action: () => handleStatusChange("IN_PROGRESS"), variant: "default" });
    actions.push({ label: "Cancel", action: () => handleStatusChange("CANCELLED"), variant: "destructive" });
  } else if (status === "IN_PROGRESS") {
    actions.push({ label: "On Hold", action: () => handleStatusChange("ON_HOLD"), variant: "outline" });
    actions.push({ label: "Submit for Review", action: () => handleStatusChange("PENDING_REVIEW"), variant: "default" });
    actions.push({ label: "Cancel", action: () => handleStatusChange("CANCELLED"), variant: "destructive" });
  } else if (status === "ON_HOLD") {
    actions.push({ label: "Resume (In Progress)", action: () => handleStatusChange("IN_PROGRESS"), variant: "default" });
    actions.push({ label: "Cancel", action: () => handleStatusChange("CANCELLED"), variant: "destructive" });
  } else if (status === "PENDING_REVIEW") {
    actions.push({ label: "Approve (Complete)", action: () => handleStatusChange("COMPLETED"), variant: "default" });
    actions.push({ label: "Reject (Rework)", action: handleRework, variant: "destructive" });
  }

  if (actions.length === 0) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Task Actions</DialogTitle>
          <DialogDescription>
            Current status: <span className="font-medium">{status.replace(/_/g, " ")}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {status === "PENDING_REVIEW" && (
            <div className="space-y-1">
              <Label className="text-xs">Rework Reason (if rejecting)</Label>
              <Textarea
                value={reworkReason}
                onChange={(e) => setReworkReason(e.target.value)}
                rows={2}
                placeholder="Explain what needs correction…"
              />
            </div>
          )}

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Task status change")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.label}
                variant={a.variant}
                size="sm"
                disabled={submitting}
                onClick={a.action}
              >
                {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

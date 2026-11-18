"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getProgressTemplates,
  getChecklistAssignmentPreview,
  assignRoomChecklist,
} from "@/lib/actions/progress-activity";
import { toast } from "sonner";
import { ClipboardList, Loader2, AlertTriangle } from "lucide-react";

interface TemplateOption {
  id: string;
  name: string;
  isActive: boolean;
  _count?: { items: number };
}

interface Preview {
  currentTemplateName: string | null;
  currentTotal: number;
  currentCompleted: number;
  newTemplateName: string;
  newActivityCount: number;
}

export function AssignChecklist({
  roomId,
  hasChecklist,
}: {
  roomId: string;
  hasChecklist: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setTemplateId("");
    setPreview(null);
    setError(null);
    getProgressTemplates().then((res) => {
      setLoading(false);
      if (res.success) {
        setTemplates(
          (res.data as TemplateOption[]).filter((t) => t.isActive)
        );
      }
    });
  }, [open]);

  async function handleSelect(value: string | null) {
    if (!value) return;
    setTemplateId(value);
    setPreview(null);
    const res = await getChecklistAssignmentPreview(roomId, value);
    if (res.success && res.data) {
      setPreview(res.data as Preview);
    }
  }

  async function handleAssign() {
    if (!templateId) return;
    setSubmitting(true);
    setError(null);
    const res = await assignRoomChecklist({ roomId, templateId });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error ?? "Could not assign checklist.");
      toast.error(res.error ?? "Could not assign checklist.");
      return;
    }
    toast.success(
      hasChecklist ? "Checklist replaced." : "Checklist assigned."
    );
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
        {hasChecklist ? "Replace checklist" : "Assign checklist"}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasChecklist ? "Replace room checklist" : "Assign room checklist"}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              The room gets an immutable snapshot of the template's current
              activities. Later template edits won't change this room's
              checklist.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No active checklist templates. Create one under{" "}
                <span className="font-medium">Checklist Templates</span> first.
              </p>
            ) : (
              <Select value={templateId} onValueChange={handleSelect}>
                <SelectTrigger id="checklist-template">
                  <SelectValue placeholder="Choose a checklist template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t._count?.items ?? 0} activities)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {preview && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 text-xs text-zinc-600 space-y-1">
                <p>
                  New checklist:{" "}
                  <span className="font-medium text-zinc-800">
                    {preview.newTemplateName}
                  </span>{" "}
                  — {preview.newActivityCount} activities will be copied as a
                  snapshot.
                </p>
                {preview.currentTemplateName && (
                  <p className="flex items-start gap-1.5 text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    Current checklist “{preview.currentTemplateName}” (
                    {preview.currentCompleted}/{preview.currentTotal} completed)
                    will be replaced. Its activities and history stay preserved
                    in the database.
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={!templateId || submitting}
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {hasChecklist ? "Replace checklist" : "Assign checklist"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

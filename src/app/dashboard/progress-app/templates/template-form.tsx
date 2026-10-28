"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createProgressTemplate,
  updateProgressTemplate,
} from "@/lib/actions/progress-activity";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface TemplateFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  template?: { id: string; name: string; description?: string | null } | null;
}

export function TemplateForm({
  open,
  onClose,
  onSaved,
  template,
}: TemplateFormProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = template
      ? await updateProgressTemplate({
          id: template.id,
          name,
          description: description || null,
        })
      : await createProgressTemplate({
          name,
          description: description || null,
        });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error ?? "Failed to save template.");
      toast.error(res.error ?? "Failed to save template.");
      return;
    }
    toast.success(template ? "Template updated." : "Template created.");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {template ? `Edit template: ${template.name}` : "New template"}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            {template
              ? "Update the template name or description."
              : "Create a checklist template you can assign to rooms."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">
              Template name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Living Room Checklist"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-description">Description</Label>
            <Textarea
              id="tpl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this checklist"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {template ? "Save changes" : "Create template"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

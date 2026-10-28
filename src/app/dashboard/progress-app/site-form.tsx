"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressSiteStatus } from "@prisma/client";
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
  createProgressSite,
  updateProgressSite,
  uploadSiteCover,
  removeSiteCover,
} from "@/lib/actions/progress-site";
import { Loader2, Building2, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface SiteFormSite {
  id: string;
  siteCode: string;
  siteName: string;
  coverImagePath?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationNotes?: string | null;
  status: ProgressSiteStatus;
  projectId?: string | null;
}

interface SiteFormProps {
  site?: SiteFormSite;
  mode: "create" | "edit";
  projects: { id: string; name: string }[];
  onClose: () => void;
}

const STATUS_LABELS: Record<ProgressSiteStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

function getInitialForm(site?: SiteFormSite) {
  return {
    siteCode: site?.siteCode ?? "",
    siteName: site?.siteName ?? "",
    description: site?.description ?? "",
    address: site?.address ?? "",
    city: site?.city ?? "",
    state: site?.state ?? "",
    latitude: site?.latitude != null ? String(site.latitude) : "",
    longitude: site?.longitude != null ? String(site.longitude) : "",
    locationNotes: site?.locationNotes ?? "",
    status: site?.status ?? ProgressSiteStatus.PLANNED,
    projectId: site?.projectId ?? "",
  };
}

export function SiteForm({ site, mode, projects, onClose }: SiteFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState(() => getInitialForm(site));
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  // Cover: staged file + preview; applied on save. coverRemoved is also
  // staged — it deletes the stored cover only once the form is saved.
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [coverRemoveConfirm, setCoverRemoveConfirm] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const hasSavedCover = isEdit && !!site?.coverImagePath;

  function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Cover image must be a JPEG, PNG or WebP file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Cover image must be 5 MB or smaller.");
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setCoverRemoved(false);
    setError(null);
  }

  function stageCoverRemoval() {
    setCoverRemoveConfirm(false);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
    setCoverRemoved(true);
  }

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload() {
    const base = {
      siteName: form.siteName,
      description: emptyToNull(form.description),
      address: emptyToNull(form.address),
      city: emptyToNull(form.city),
      state: emptyToNull(form.state),
      latitude: emptyToNull(form.latitude),
      longitude: emptyToNull(form.longitude),
      locationNotes: emptyToNull(form.locationNotes),
      status: form.status,
      projectId: form.projectId || null,
    };

    if (isEdit) {
      return { id: site!.id, ...base };
    }
    return { siteCode: form.siteCode, ...base };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    let savedSiteId: string | null = null;

    try {
      const payload = buildPayload();
      const result = isEdit
        ? await updateProgressSite(
            payload as unknown as Parameters<typeof updateProgressSite>[0]
          )
        : await createProgressSite(
            payload as unknown as Parameters<typeof createProgressSite>[0]
          );

      if (!result.success) {
        setError(result.error ?? "Failed to save site.");
        toast.error(result.error ?? "Failed to save site.");
        return;
      }
      savedSiteId = isEdit ? site!.id : result.data!.id;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
      return;
    } finally {
      setSubmitting(false);
    }

    // Apply staged cover changes now that the site exists. A cover failure
    // must not undo the saved site — surface it and keep the saved record.
    let coverError: string | null = null;
    if (coverRemoved && hasSavedCover) {
      const res = await removeSiteCover(savedSiteId);
      if (!res.success) coverError = res.error ?? "Could not remove cover.";
    }
    if (!coverRemoved && coverFile) {
      const fd = new FormData();
      fd.set("file", coverFile);
      const res = await uploadSiteCover(savedSiteId, fd);
      if (!res.success) coverError = res.error ?? "Could not upload cover.";
    }

    if (coverError) {
      toast.warning(`Site saved — cover change failed: ${coverError}`);
    } else {
      toast.success(
        mode === "create"
          ? "Site created successfully"
          : "Site updated successfully"
      );
    }
    if (mode === "create") {
      // Land the administrator on the site's setup page so building
      // structure can be configured immediately.
      router.push(`/dashboard/progress-app/sites/${savedSiteId}`);
    }
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="pb-3 border-b">
          <DialogTitle className="text-xl font-bold">
            {isEdit ? `Edit Site: ${site?.siteName}` : "New Site"}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            {isEdit
              ? "Update site master details. The site code cannot be changed."
              : "Register a construction site for progress tracking."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto pr-1 pt-4 space-y-4">
            {error && (
              <ErrorBanner
                error={error}
                onAskAi={askAi}
                askingAi={askingAi}
                aiResponse={aiResponse}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="siteCode">
                  Site code <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="siteCode"
                  value={form.siteCode}
                  onChange={(e) => updateField("siteCode", e.target.value)}
                  placeholder="e.g. SAEC-001"
                  disabled={isEdit}
                  required
                />
                {isEdit && (
                  <p className="text-xs text-zinc-400">
                    Site code is permanent and cannot be changed.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="siteName">
                  Site name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="siteName"
                  value={form.siteName}
                  onChange={(e) => updateField("siteName", e.target.value)}
                  placeholder="e.g. Shivalik Residency"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    updateField("status", (v ?? form.status) as ProgressSiteStatus)
                  }
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ProgressSiteStatus).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="projectId">Linked ERP project (optional)</Label>
                <Select
                  value={form.projectId || "none"}
                  onValueChange={(v) =>
                    updateField("projectId", v === "none" ? "" : (v ?? ""))
                  }
                >
                  <SelectTrigger id="projectId">
                    <SelectValue placeholder="No linked project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Brief description of the site"
                  rows={2}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="Site address"
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="e.g. Ahmedabad"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                  placeholder="e.g. Gujarat"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => updateField("latitude", e.target.value)}
                  placeholder="e.g. 23.0225"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => updateField("longitude", e.target.value)}
                  placeholder="e.g. 72.5714"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="locationNotes">Location notes</Label>
                <Input
                  id="locationNotes"
                  value={form.locationNotes}
                  onChange={(e) =>
                    updateField("locationNotes", e.target.value)
                  }
                  placeholder="Landmark, directions, or geo-notes for site staff"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Site cover image</Label>
                <div className="flex items-start gap-4">
                  <div className="flex h-24 w-32 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                    {coverPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverPreview}
                        alt="New cover preview"
                        className="h-full w-full object-cover"
                      />
                    ) : hasSavedCover && !coverRemoved ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/site-covers/${site!.id}?v=${encodeURIComponent(site!.coverImagePath!)}`}
                        alt={`${site?.siteName} cover`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Building2 className="h-8 w-8 text-zinc-300" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={pickCover}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => coverInputRef.current?.click()}
                    >
                      <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                      {coverPreview || hasSavedCover
                        ? "Replace image"
                        : "Choose image"}
                    </Button>
                    {(coverPreview || (hasSavedCover && !coverRemoved)) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setCoverRemoveConfirm(true)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Remove cover
                      </Button>
                    )}
                    {coverRemoved && hasSavedCover && (
                      <p className="text-xs text-amber-600">
                        The saved cover will be removed when you save.
                      </p>
                    )}
                    <p className="text-[11px] text-zinc-400">
                      JPEG, PNG or WebP, up to 5 MB.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4 mt-4">
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
              {isEdit ? "Save changes" : "Create site"}
            </Button>
          </div>
        </form>
      </DialogContent>

      <Dialog
        open={coverRemoveConfirm}
        onOpenChange={setCoverRemoveConfirm}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove site cover</DialogTitle>
            <DialogDescription>
              Remove the cover image for <strong>{site?.siteName}</strong>?
              The stored file is deleted when you save the site. This does
              not affect site progress data or photos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setCoverRemoveConfirm(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={stageCoverRemoval}>
              Remove cover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

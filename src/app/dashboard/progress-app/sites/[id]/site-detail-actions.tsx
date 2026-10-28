"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressSiteStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SiteForm } from "../../site-form";
import { setProgressSiteStatus } from "@/lib/actions/progress-site";
import { toast } from "sonner";
import { Pencil, Archive, ArchiveRestore, Loader2 } from "lucide-react";

interface DetailSite {
  id: string;
  siteCode: string;
  siteName: string;
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

interface SiteDetailActionsProps {
  site: DetailSite;
  projects: { id: string; name: string }[];
}

export function SiteDetailActions({ site, projects }: SiteDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isArchived = site.status === ProgressSiteStatus.ARCHIVED;

  async function handleStatusChange() {
    setBusy(true);
    setActionError(null);
    const next = isArchived
      ? ProgressSiteStatus.PLANNED
      : ProgressSiteStatus.ARCHIVED;
    const res = await setProgressSiteStatus(site.id, next);
    setBusy(false);
    if (!res.success) {
      setActionError(res.error ?? "Could not update the site status.");
      return;
    }
    toast.success(
      isArchived
        ? `Site ${site.siteCode} restored to Planned.`
        : `Site ${site.siteCode} archived.`
    );
    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit site
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className={
          isArchived
            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            : "border-amber-200 text-amber-700 hover:bg-amber-50"
        }
      >
        {isArchived ? (
          <>
            <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
            Restore site
          </>
        ) : (
          <>
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            Archive site
          </>
        )}
      </Button>

      {editOpen && (
        <SiteForm
          site={site}
          mode="edit"
          projects={projects}
          onClose={() => setEditOpen(false)}
        />
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmOpen(false);
            setActionError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isArchived ? "Restore site" : "Archive site"}
            </DialogTitle>
            <DialogDescription>
              {isArchived
                ? `Restore ${site.siteName} (${site.siteCode})? The site status will be set back to Planned.`
                : `Archive ${site.siteName} (${site.siteCode})? Archived sites are hidden from the default list but remain in the database.`}
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <p className="text-sm text-red-600">{actionError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant={isArchived ? "default" : "destructive"}
              onClick={handleStatusChange}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isArchived ? "Restore site" : "Archive site"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

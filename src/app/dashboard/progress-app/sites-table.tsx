"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProgressSiteStatus } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProgressSiteFilterInput } from "@/lib/schemas/progress-site";
import { setProgressSiteStatus } from "@/lib/actions/progress-site";
import { SiteForm } from "./site-form";
import { toast } from "sonner";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Archive,
  Loader2,
  Layers,
} from "lucide-react";

interface SiteRow {
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
  coverImagePath?: string | null;
  projectId?: string | null;
  createdAt: string | Date;
  project?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string | null; email: string | null } | null;
}

interface SitesTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: ProgressSiteFilterInput;
  canManage: boolean;
  projects: { id: string; name: string }[];
}

const STATUS_STYLES: Record<ProgressSiteStatus, string> = {
  PLANNED: "bg-sky-50 text-sky-700 border-sky-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ON_HOLD: "bg-amber-50 text-amber-700 border-amber-200",
  COMPLETED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  ARCHIVED: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

const STATUS_LABELS: Record<ProgressSiteStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function locationLabel(site: SiteRow): string {
  const parts = [site.city, site.state].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function SitesTable({
  rows,
  page,
  total,
  totalPages,
  filter,
  canManage,
  projects,
}: SitesTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SiteRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SiteRow | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const typedRows = rows as SiteRow[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (filter.status) params.set("status", filter.status);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError(null);
    const res = await setProgressSiteStatus(
      archiveTarget.id,
      ProgressSiteStatus.ARCHIVED
    );
    setArchiving(false);
    if (!res.success) {
      setArchiveError(res.error ?? "Could not archive this site.");
      return;
    }
    toast.success(`Site ${archiveTarget.siteCode} archived.`);
    setArchiveTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">
          Site records ({total})
        </h2>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New site
          </Button>
        )}
      </div>

      {typedRows.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">No sites found</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500 mb-4">
              {filter.search || filter.status
                ? "No sites match the current search or filters."
                : "Register a construction site to start tracking progress."}
            </p>
            {canManage && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New site
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm">
          <div className="max-h-[70vh] overflow-auto">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="whitespace-nowrap">Site Code</TableHead>
                  <TableHead className="whitespace-nowrap">Site Name</TableHead>
                  <TableHead className="whitespace-nowrap">Location</TableHead>
                  <TableHead className="whitespace-nowrap">
                    Linked Project
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Created</TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typedRows.map((site) => (
                  <TableRow
                    key={site.id}
                    className="hover:bg-zinc-50/70 transition-colors"
                  >
                    <TableCell className="whitespace-nowrap font-mono font-semibold text-zinc-900">
                      {site.siteCode}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      <Link
                        href={`/dashboard/progress-app/sites/${site.id}`}
                        className="inline-flex items-center gap-2.5 text-zinc-900 hover:text-zinc-600"
                      >
                        {site.coverImagePath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/site-covers/${site.id}?v=${encodeURIComponent(site.coverImagePath)}`}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-md border border-zinc-200 object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-100">
                            <Building2 className="h-4 w-4 text-zinc-400" />
                          </span>
                        )}
                        <span className="hover:underline">
                          {site.siteName}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {locationLabel(site)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {site.project?.name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={STATUS_STYLES[site.status]}
                      >
                        {STATUS_LABELS[site.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(site.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div className="flex gap-1 justify-end">
                        <Link
                          href={`/dashboard/progress-app/sites/${site.id}`}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5"
                            title="View site"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link
                          href={`/dashboard/progress-app/sites/${site.id}#site-structure`}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5"
                            title="Manage Site Structure"
                          >
                            <Layers className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        {canManage && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5"
                              onClick={() => setEditTarget(site)}
                              title="Edit site"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {site.status !== ProgressSiteStatus.ARCHIVED && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => setArchiveTarget(site)}
                                title="Archive site"
                              >
                                <Archive className="h-3.5 w-3.5 text-amber-600" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Page {page} of {totalPages} ({total} records)
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => router.push(buildQueryString(page - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => router.push(buildQueryString(page + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {createOpen && (
        <SiteForm
          mode="create"
          projects={projects}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {editTarget && (
        <SiteForm
          site={editTarget}
          mode="edit"
          projects={projects}
          onClose={() => setEditTarget(null)}
        />
      )}

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
            setArchiveError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive site</DialogTitle>
            <DialogDescription>
              Archive <strong>{archiveTarget?.siteName}</strong> (
              {archiveTarget?.siteCode})? Archived sites are hidden from the
              default list but remain in the database. You can restore the site
              later by changing its status.
            </DialogDescription>
          </DialogHeader>
          {archiveError && (
            <p className="text-sm text-red-600">{archiveError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setArchiveTarget(null)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={archiving}
            >
              {archiving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Archive site
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

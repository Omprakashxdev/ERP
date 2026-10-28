import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProgressSiteStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import {
  getProgressSiteById,
  getProgressAppProjects,
} from "@/lib/actions/progress-site";
import { getProgressWings } from "@/lib/actions/progress-hierarchy";
import {
  getScopeProgress,
  getChildrenProgress,
} from "@/lib/actions/progress-activity";
import {
  getAssignableUsers,
  getSiteAssignmentHistory,
  getSiteAssignments,
} from "@/lib/actions/progress-assignments";
import { getProgressPhotos } from "@/lib/actions/progress-photos";
import { serialize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, ArrowLeft } from "lucide-react";
import { SiteDetailActions } from "./site-detail-actions";
import { HierarchyChildren } from "../../hierarchy-children";
import { ProgressSummaryCard } from "../../progress-summary-card";
import { RollupLike } from "../../progress-bar";
import { SiteAssignments } from "./site-assignments";
import { PhotoGallery } from "../../photo-gallery";

export const metadata = {
  title: "Site — Progress App — SAEC ERP",
};

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

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">
        {label}
      </span>
      <span className="text-sm font-medium text-zinc-900">{value ?? "—"}</span>
    </div>
  );
}

interface SiteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SiteDetailPage({ params }: SiteDetailPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const canManage = hasPermission(session.user.role, "progressApp", "create");

  const [
    siteResult,
    projectsResult,
    wingsResult,
    progressResult,
    childProgress,
    assignmentsResult,
    historyResult,
    usersResult,
    photosResult,
  ] = await Promise.all([
    getProgressSiteById(id),
    canManage ? getProgressAppProjects() : Promise.resolve(null),
    getProgressWings(id),
    getScopeProgress({ siteId: id }),
    getChildrenProgress("wing", id),
    getSiteAssignments(id),
    getSiteAssignmentHistory(id),
    canManage ? getAssignableUsers() : Promise.resolve(null),
    getProgressPhotos({ siteId: id }),
  ]);

  if (!siteResult.success || !siteResult.data) {
    notFound();
  }

  const site = siteResult.data as {
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
    updatedAt: string | Date;
    project?: { id: string; name: string; abbreviation?: string | null } | null;
    createdBy?: { id: string; name: string | null; email: string | null } | null;
  };

  const projects =
    projectsResult && projectsResult.success ? (projectsResult.data ?? []) : [];
  const wings = wingsResult.success ? (wingsResult.data ?? []) : [];
  const rollup = (
    progressResult.success ? progressResult.data : null
  ) as RollupLike | null;
  const progressMap = (
    childProgress.success ? childProgress.data : {}
  ) as Record<string, RollupLike>;

  const coordinates =
    site.latitude != null && site.longitude != null
      ? `${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}`
      : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/progress-app">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                {site.siteName}
              </h1>
              <Badge variant="outline" className={STATUS_STYLES[site.status]}>
                {STATUS_LABELS[site.status]}
              </Badge>
            </div>
            <p className="text-sm text-zinc-500">
              <span className="font-mono">{site.siteCode}</span>
              {site.city || site.state
                ? ` · ${[site.city, site.state].filter(Boolean).join(", ")}`
                : ""}
            </p>
          </div>
        </div>
        {canManage && (
          <SiteDetailActions
            site={serialize(site) as never}
            projects={serialize(projects) as never}
          />
        )}
      </div>

      {site.description && (
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-zinc-700">{site.description}</p>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-700">
            Site details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <DetailRow label="Site code" value={site.siteCode} />
            <DetailRow
              label="Status"
              value={STATUS_LABELS[site.status]}
            />
            <DetailRow
              label="Linked project"
              value={site.project?.name}
            />
            <DetailRow label="City" value={site.city} />
            <DetailRow label="State" value={site.state} />
            <DetailRow
              label="Created by"
              value={site.createdBy?.name ?? site.createdBy?.email}
            />
            <DetailRow label="Created" value={formatDate(site.createdAt)} />
            <DetailRow
              label="Last updated"
              value={formatDate(site.updatedAt)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <MapPin className="h-4 w-4" />
            Location
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailRow label="Address" value={site.address} />
            <DetailRow label="Coordinates" value={coordinates} />
            <DetailRow label="Location notes" value={site.locationNotes} />
          </div>
        </CardContent>
      </Card>

      {rollup && <ProgressSummaryCard title="Site progress" rollup={rollup} />}

      <HierarchyChildren
        kind="wing"
        parentId={site.id}
        rows={serialize(wings) as never}
        canManage={canManage}
        progressMap={progressMap}
      />

      <SiteAssignments
        siteId={site.id}
        assignments={
          serialize(
            assignmentsResult.success ? assignmentsResult.data : []
          ) as never
        }
        history={
          serialize(historyResult.success ? historyResult.data : []) as never
        }
        users={
          serialize(
            usersResult && usersResult.success ? usersResult.data : []
          ) as never
        }
        canManage={canManage}
      />

      <PhotoGallery
        photos={
          serialize(photosResult.success ? photosResult.data : []) as never
        }
      />
    </div>
  );
}

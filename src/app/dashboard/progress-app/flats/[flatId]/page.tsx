import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import {
  getProgressFlatById,
  getProgressRooms,
} from "@/lib/actions/progress-hierarchy";
import {
  getScopeProgress,
  getChildrenProgress,
} from "@/lib/actions/progress-activity";
import { getProgressPhotos } from "@/lib/actions/progress-photos";
import { serialize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { HierarchyBreadcrumbs } from "../../hierarchy-breadcrumbs";
import { HierarchyChildren } from "../../hierarchy-children";
import { ProgressSummaryCard } from "../../progress-summary-card";
import { RollupLike } from "../../progress-bar";
import { PhotoGallery } from "../../photo-gallery";

export const metadata = {
  title: "Flat — Progress App — SAEC ERP",
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

interface FlatDetailPageProps {
  params: Promise<{ flatId: string }>;
}

export default async function FlatDetailPage({ params }: FlatDetailPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { flatId } = await params;
  const canManage = hasPermission(session.user.role, "progressApp", "create");

  const [flatResult, roomsResult, progressResult, childProgress, photosResult] =
    await Promise.all([
      getProgressFlatById(flatId),
      getProgressRooms(flatId),
      getScopeProgress({ flatId }),
      getChildrenProgress("room", flatId),
      getProgressPhotos({ flatId }),
    ]);

  if (!flatResult.success || !flatResult.data) {
    notFound();
  }

  const flat = flatResult.data as {
    id: string;
    flatNumber: string;
    flatType?: string | null;
    displayOrder: number;
    isActive: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
    floor: {
      id: string;
      floorIdentifier: string;
      displayName?: string | null;
      wing: {
        id: string;
        code: string;
        name: string;
        site: { id: string; siteCode: string; siteName: string };
      };
    };
    _count: { rooms: number };
  };

  const rooms = roomsResult.success ? (roomsResult.data ?? []) : [];
  const rollup = (
    progressResult.success ? progressResult.data : null
  ) as RollupLike | null;
  const progressMap = (
    childProgress.success ? childProgress.data : {}
  ) as Record<string, RollupLike>;
  const { floor } = flat;
  const { wing } = floor;
  const { site } = wing;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <HierarchyBreadcrumbs
        items={[
          {
            label: site.siteName,
            href: `/dashboard/progress-app/sites/${site.id}`,
          },
          {
            label: `Wing ${wing.code}`,
            href: `/dashboard/progress-app/wings/${wing.id}`,
          },
          {
            label: `Floor ${floor.floorIdentifier}`,
            href: `/dashboard/progress-app/floors/${floor.id}`,
          },
          { label: `Flat ${flat.flatNumber}` },
        ]}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/progress-app/floors/${floor.id}`}>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
            <Home className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                Flat {flat.flatNumber}
              </h1>
              <Badge
                variant="outline"
                className={
                  flat.isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-zinc-100 text-zinc-500 border-zinc-200"
                }
              >
                {flat.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-zinc-500">
              {flat.flatType ? `${flat.flatType} · ` : ""}
              {`Floor ${floor.floorIdentifier} · Wing ${wing.code} · ${site.siteName}`}
            </p>
          </div>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-700">
            Flat details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <DetailRow label="Flat number" value={flat.flatNumber} />
            <DetailRow label="Flat type" value={flat.flatType} />
            <DetailRow label="Rooms" value={flat._count.rooms} />
            <DetailRow label="Display order" value={flat.displayOrder} />
            <DetailRow
              label="Status"
              value={flat.isActive ? "Active" : "Inactive"}
            />
            <DetailRow label="Created" value={formatDate(flat.createdAt)} />
            <DetailRow
              label="Last updated"
              value={formatDate(flat.updatedAt)}
            />
          </div>
        </CardContent>
      </Card>

      {rollup && <ProgressSummaryCard title="Flat progress" rollup={rollup} />}

      <HierarchyChildren
        kind="room"
        parentId={flat.id}
        rows={serialize(rooms) as never}
        canManage={canManage}
        progressMap={progressMap}
      />

      <PhotoGallery
        photos={
          serialize(photosResult.success ? photosResult.data : []) as never
        }
      />
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import {
  getProgressRoomById,
  getScopeProgress,
} from "@/lib/actions/progress-activity";
import { getProgressPhotos } from "@/lib/actions/progress-photos";
import { serialize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressActivityStatus } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DoorOpen, ArrowLeft, ClipboardList } from "lucide-react";
import { HierarchyBreadcrumbs } from "../../hierarchy-breadcrumbs";
import {
  ProgressBar,
  RollupLike,
  formatPercent,
} from "../../progress-bar";
import { AssignChecklist } from "./assign-checklist";
import { PhotoGallery } from "../../photo-gallery";

export const metadata = {
  title: "Room — Progress App — SAEC ERP",
};

const STATUS_STYLES: Record<ProgressActivityStatus, string> = {
  NOT_STARTED: "bg-zinc-100 text-zinc-500 border-zinc-200",
  IN_PROGRESS: "bg-sky-50 text-sky-700 border-sky-200",
  ON_HOLD: "bg-amber-50 text-amber-700 border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_LABELS: Record<ProgressActivityStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
};

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

interface RoomDetailPageProps {
  params: Promise<{ roomId: string }>;
}

export default async function RoomDetailPage({ params }: RoomDetailPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { roomId } = await params;
  const canManage = hasPermission(session.user.role, "progressApp", "create");

  const [roomResult, progressResult, photosResult] = await Promise.all([
    getProgressRoomById(roomId),
    getScopeProgress({ roomId }),
    getProgressPhotos({ roomId }),
  ]);

  if (!roomResult.success || !roomResult.data) {
    notFound();
  }

  const room = roomResult.data as {
    id: string;
    roomName: string;
    roomType?: string | null;
    displayOrder: number;
    isActive: boolean;
    flat: {
      id: string;
      flatNumber: string;
      flatType?: string | null;
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
    };
    checklists: {
      id: string;
      templateVersion: number;
      assignedAt: string | Date;
      template: { id: string; name: string; version: number };
      assignedBy: { name: string | null; email: string };
      activities: {
        id: string;
        activityNameSnapshot: string;
        descriptionSnapshot: string | null;
        displayOrder: number;
        status: ProgressActivityStatus;
        revision: number;
        updatedAt: string | Date;
        _count: { history: number };
      }[];
    }[];
  };

  const rollup = (
    progressResult.success ? progressResult.data : null
  ) as RollupLike | null;
  const checklist = room.checklists[0] ?? null;
  const { flat } = room;
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
          {
            label: `Flat ${flat.flatNumber}`,
            href: `/dashboard/progress-app/flats/${flat.id}`,
          },
          { label: room.roomName },
        ]}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/progress-app/flats/${flat.id}`}>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
            <DoorOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                {room.roomName}
              </h1>
              <Badge
                variant="outline"
                className={
                  room.isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-zinc-100 text-zinc-500 border-zinc-200"
                }
              >
                {room.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-zinc-500">
              {room.roomType ? `${room.roomType} · ` : ""}
              {`Flat ${flat.flatNumber} · Floor ${floor.floorIdentifier} · Wing ${wing.code} · ${site.siteName}`}
            </p>
          </div>
        </div>
        {canManage && (
          <AssignChecklist roomId={room.id} hasChecklist={checklist !== null} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-700">
              Room details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 gap-4">
              <DetailRow label="Room name" value={room.roomName} />
              <DetailRow label="Room type" value={room.roomType} />
              <DetailRow label="Flat" value={`Flat ${flat.flatNumber}`} />
              <DetailRow
                label="Status"
                value={room.isActive ? "Active" : "Inactive"}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-700">
              Room progress
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {rollup && rollup.percent !== null ? (
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-semibold tracking-tight text-zinc-900">
                    {formatPercent(rollup.percent)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {rollup.completedActivities} of {rollup.totalActivities}{" "}
                    activities completed
                  </span>
                </div>
                <ProgressBar percent={rollup.percent} />
                <p className="text-[11px] text-zinc-400">
                  Equal weight per activity. Updated by field staff via the
                  Android app.
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Progress not configured — assign a checklist to this room.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
              <ClipboardList className="h-4 w-4" />
              Activity checklist
              {checklist && (
                <Badge
                  variant="secondary"
                  className="font-normal text-xs bg-zinc-100 text-zinc-600"
                >
                  {checklist.activities.length}
                </Badge>
              )}
            </CardTitle>
            {checklist && (
              <span className="text-[11px] text-zinc-400">
                {checklist.template.name} · snapshot v
                {checklist.templateVersion} · assigned{" "}
                {new Date(checklist.assignedAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {!checklist ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-10 text-center">
              <ClipboardList className="h-10 w-10 text-zinc-300" />
              <p className="mt-3 text-sm font-medium text-zinc-700">
                No checklist assigned.
              </p>
              <p className="mt-1 max-w-sm text-xs text-zinc-500">
                Assign an activity checklist template to start tracking
                progress for this room.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-100">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 whitespace-nowrap text-right">
                      #
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Activity
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Description
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Last updated
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checklist.activities.map((activity) => (
                    <TableRow
                      key={activity.id}
                      className="transition-colors hover:bg-zinc-50/70"
                    >
                      <TableCell className="whitespace-nowrap text-right text-zinc-500">
                        {activity.displayOrder}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {activity.activityNameSnapshot}
                      </TableCell>
                      <TableCell className="max-w-52 truncate">
                        {activity.descriptionSnapshot ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={STATUS_STYLES[activity.status]}
                        >
                          {STATUS_LABELS[activity.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-zinc-500">
                        {activity._count.history > 0
                          ? new Date(activity.updatedAt).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }
                            )
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PhotoGallery
        photos={
          serialize(photosResult.success ? photosResult.data : []) as never
        }
      />
    </div>
  );
}

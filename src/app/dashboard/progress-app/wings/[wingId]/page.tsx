import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import {
  getProgressWingById,
  getProgressFloors,
} from "@/lib/actions/progress-hierarchy";
import {
  getScopeProgress,
  getChildrenProgress,
} from "@/lib/actions/progress-activity";
import { serialize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building, ArrowLeft } from "lucide-react";
import { HierarchyBreadcrumbs } from "../../hierarchy-breadcrumbs";
import { HierarchyChildren } from "../../hierarchy-children";
import { ProgressSummaryCard } from "../../progress-summary-card";
import { RollupLike } from "../../progress-bar";

export const metadata = {
  title: "Wing — Progress App — SAEC ERP",
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

interface WingDetailPageProps {
  params: Promise<{ wingId: string }>;
}

export default async function WingDetailPage({ params }: WingDetailPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { wingId } = await params;
  const canManage = hasPermission(session.user.role, "progressApp", "create");

  const [wingResult, floorsResult, progressResult, childProgress] =
    await Promise.all([
      getProgressWingById(wingId),
      getProgressFloors(wingId),
      getScopeProgress({ wingId }),
      getChildrenProgress("floor", wingId),
    ]);

  if (!wingResult.success || !wingResult.data) {
    notFound();
  }

  const wing = wingResult.data as {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    displayOrder: number;
    isActive: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
    site: { id: string; siteCode: string; siteName: string };
    _count: { floors: number };
  };

  const floors = floorsResult.success ? (floorsResult.data ?? []) : [];
  const rollup = (
    progressResult.success ? progressResult.data : null
  ) as RollupLike | null;
  const progressMap = (
    childProgress.success ? childProgress.data : {}
  ) as Record<string, RollupLike>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <HierarchyBreadcrumbs
        items={[
          {
            label: wing.site.siteName,
            href: `/dashboard/progress-app/sites/${wing.site.id}`,
          },
          { label: `Wing ${wing.code}` },
        ]}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/progress-app/sites/${wing.site.id}`}>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
            <Building className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                {wing.name}
              </h1>
              <Badge
                variant="outline"
                className={
                  wing.isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-zinc-100 text-zinc-500 border-zinc-200"
                }
              >
                {wing.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-zinc-500">
              <span className="font-mono">{wing.code}</span>
              {` · ${wing.site.siteName}`}
            </p>
          </div>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-700">
            Wing details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <DetailRow label="Wing code" value={wing.code} />
            <DetailRow label="Floors" value={wing._count.floors} />
            <DetailRow label="Display order" value={wing.displayOrder} />
            <DetailRow
              label="Status"
              value={wing.isActive ? "Active" : "Inactive"}
            />
            <DetailRow label="Created" value={formatDate(wing.createdAt)} />
            <DetailRow
              label="Last updated"
              value={formatDate(wing.updatedAt)}
            />
            {wing.description && (
              <div className="col-span-2">
                <DetailRow label="Description" value={wing.description} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {rollup && <ProgressSummaryCard title="Wing progress" rollup={rollup} />}

      <HierarchyChildren
        kind="floor"
        parentId={wing.id}
        rows={serialize(floors) as never}
        canManage={canManage}
        progressMap={progressMap}
      />
    </div>
  );
}

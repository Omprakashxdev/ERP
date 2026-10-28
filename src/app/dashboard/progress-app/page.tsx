import { redirect } from "next/navigation";
import { ProgressSiteStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import {
  getProgressSites,
  getProgressAppProjects,
} from "@/lib/actions/progress-site";
import { serialize } from "@/lib/utils";
import { ProgressSiteFilterInput } from "@/lib/schemas/progress-site";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, FileSpreadsheet } from "lucide-react";
import { ModuleHeader } from "@/components/module-header";
import { SiteFilters } from "./site-filters";
import { SitesTable } from "./sites-table";

export const metadata = {
  title: "Progress App — SAEC ERP",
};

interface ProgressAppPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
  }>;
}

function parseStatus(value: string | undefined): ProgressSiteStatus | undefined {
  if (!value) return undefined;
  return (Object.values(ProgressSiteStatus) as string[]).includes(value)
    ? (value as ProgressSiteStatus)
    : undefined;
}

export default async function ProgressAppPage({
  searchParams,
}: ProgressAppPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const canManage = hasPermission(session.user.role, "progressApp", "create");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;

  const filter: ProgressSiteFilterInput = {
    search: params.search,
    status: parseStatus(params.status),
  };

  const [sitesResult, projectsResult] = await Promise.all([
    getProgressSites(filter, page, pageSize),
    canManage ? getProgressAppProjects() : Promise.resolve(null),
  ]);

  const rows = sitesResult.success ? (sitesResult.data?.rows ?? []) : [];
  const total = sitesResult.success ? (sitesResult.data?.total ?? 0) : 0;
  const totalPages = Math.ceil(total / pageSize);
  const projects =
    projectsResult && projectsResult.success
      ? (projectsResult.data ?? [])
      : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ModuleHeader
        icon={Building2}
        title="Progress App"
        description="ERP-controlled construction site master for site progress reporting"
        totalCount={total}
        countLabel="Sites"
      />

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <SiteFilters initialFilter={filter} />
        </CardContent>
      </Card>

      {sitesResult.success ? (
        <SitesTable
          rows={serialize(rows) as never}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          filter={filter}
          canManage={canManage}
          projects={serialize(projects) as never}
        />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">Failed to load sites</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {sitesResult.error ?? "An unexpected error occurred."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

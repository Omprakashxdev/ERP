import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWips } from "@/lib/actions/wip";
import { getRegions } from "@/lib/actions/region";
import { getClients } from "@/lib/actions/client";
import { getProjects } from "@/lib/actions/project";
import { getStaff } from "@/lib/actions/staff";
import { serialize } from "@/lib/utils";
import { WipTable } from "./wip-table";
import { WipFilters } from "./wip-filters";
import { WipSkeleton } from "./wip-skeleton";
import { WipFilterInput } from "@/lib/schemas/wip";
import { Card, CardContent } from "@/components/ui/card";
import { Hammer, FileSpreadsheet } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";

interface WipPageProps {
  searchParams: Promise<{
    search?: string;
    regionId?: string;
    clientId?: string;
    projectId?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function WipPage({ searchParams }: WipPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;

  const filter: WipFilterInput = {
    search: params.search,
    regionId: params.regionId,
    clientId: params.clientId,
    projectId: params.projectId,
    status: params.status as never,
  };

  const [wipResult, regionsResult, clientsResult, projectsResult, staffResult] =
    await Promise.all([
      getWips(filter, page, pageSize),
      getRegions(),
      getClients(),
      getProjects(),
      getStaff(),
    ]);

  const rows = wipResult.success ? (wipResult.data?.rows ?? []) : [];
  const total = wipResult.success ? (wipResult.data?.total ?? 0) : 0;
  const regions = regionsResult.success ? (regionsResult.data ?? []) : [];
  const clients = clientsResult.success ? (clientsResult.data ?? []) : [];
  const projects = projectsResult.success
    ? (projectsResult.data?.rows ?? [])
    : [];
  const staff = staffResult.success ? (staffResult.data ?? []) : [];

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <Hammer className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Work In Progress
            </h1>
            <p className="text-sm text-zinc-500">
              Track work orders, RA bills, security deposits, and completion
            </p>
          </div>
        </div>
        <BulkImportDialog module="wip" moduleLabel="Work In Progress" />
      </div>


      <Card className="shadow-sm">
        <CardContent className="p-4">
          <WipFilters
            regions={serialize(regions) as { id: string; name: string }[]}
            clients={serialize(clients) as { id: string; name: string }[]}
            projects={serialize(projects) as { id: string; name: string }[]}
            initialFilter={filter}
          />
        </CardContent>
      </Card>

      {wipResult.success ? (
        <WipTable
          rows={serialize(rows) as never}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          filter={filter}
          projects={serialize(projects) as { id: string; name: string }[]}
          staff={serialize(staff) as { id: string; name: string | null }[]}
        />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">Failed to load WIP</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {wipResult.error ?? "An unexpected error occurred."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

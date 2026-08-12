import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDueBills, getDueBillsSummary } from "@/lib/actions/due-bill";
import { getRegions } from "@/lib/actions/region";
import { getClients } from "@/lib/actions/client";
import { getProjects } from "@/lib/actions/project";
import { getStaff } from "@/lib/actions/staff";
import { serialize } from "@/lib/utils";
import { DueBillsTable } from "./due-bills-table";
import { DueBillsFilters } from "./due-bills-filters";
import { DueBillsSkeleton } from "./due-bills-skeleton";
import { BillSummaryView } from "./bill-summary-view";
import { DueBillFilterInput } from "@/lib/schemas/due-bill";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, FileSpreadsheet } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { DueBillsViewToggle } from "./view-toggle";

interface DueBillsPageProps {
  searchParams: Promise<{
    search?: string;
    regionId?: string;
    clientId?: string;
    projectId?: string;
    status?: string;
    scheme?: string;
    page?: string;
    view?: string;
  }>;
}

export default async function DueBillsPage({
  searchParams,
}: DueBillsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;
  const view = params.view === "summary" ? "summary" : "list";

  const filter: DueBillFilterInput = {
    search: params.search,
    regionId: params.regionId,
    clientId: params.clientId,
    projectId: params.projectId,
    status: params.status as never,
    scheme: params.scheme,
  };

  const [dueBillsResult, summaryResult, regionsResult, clientsResult, projectsResult, staffResult] =
    await Promise.all([
      getDueBills(filter, page, pageSize),
      getDueBillsSummary(filter),
      getRegions(),
      getClients(),
      getProjects(),
      getStaff(),
    ]);

  const rows = dueBillsResult.success ? (dueBillsResult.data?.rows ?? []) : [];
  const total = dueBillsResult.success ? (dueBillsResult.data?.total ?? 0) : 0;
  const summaryGroups = summaryResult.success ? (summaryResult.data ?? []) : [];
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
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Due Bills Status
            </h1>
            <p className="text-sm text-zinc-500">
              Consultancy billing lifecycle and collection tracking
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DueBillsViewToggle currentView={view} />
          <BulkImportDialog module="dueBills" moduleLabel="Due Bills" />
        </div>
      </div>


      <Card className="shadow-sm">
        <CardContent className="p-4">
          <DueBillsFilters
            regions={serialize(regions) as { id: string; name: string }[]}
            clients={serialize(clients) as { id: string; name: string }[]}
            projects={serialize(projects) as { id: string; name: string }[]}
            initialFilter={filter}
          />
        </CardContent>
      </Card>

      {view === "summary" ? (
        <BillSummaryView groups={serialize(summaryGroups) as never} />
      ) : dueBillsResult.success ? (
        <DueBillsTable
          rows={serialize(rows) as never}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          filter={filter}
          projects={serialize(projects) as { id: string; name: string }[]}
          staff={serialize(staff) as { id: string; name: string }[]}
        />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">Failed to load Due Bills</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {dueBillsResult.error ?? "An unexpected error occurred."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

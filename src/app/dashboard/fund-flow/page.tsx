import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import { getFundFlows } from "@/lib/actions/fund-flow";
import { getRegions } from "@/lib/actions/region";
import { getClients } from "@/lib/actions/client";
import { getStaff } from "@/lib/actions/staff";
import { serialize } from "@/lib/utils";
import { FundFlowTable } from "./fund-flow-table";
import { FundFlowFilters } from "./fund-flow-filters";
import { FundFlowSkeleton } from "./fund-flow-skeleton";
import { MonthlyIncomeSummary } from "./monthly-income-summary";
import { FundFlowPageTabs } from "./fund-flow-tabs";
import { FundFlowFilterInput } from "@/lib/schemas/fund-flow";
import { Card, CardContent } from "@/components/ui/card";
import { Landmark, FileSpreadsheet } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { ModuleHeader } from "@/components/module-header";

interface FundFlowPageProps {
  searchParams: Promise<{
    search?: string;
    regionId?: string;
    clientId?: string;
    status?: string;
    page?: string;
    tab?: string;
  }>;
}

export default async function FundFlowPage({ searchParams }: FundFlowPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const canManageProjects =
    hasPermission(session.user.role, "projectManagement", "create") ||
    hasPermission(session.user.role, "projectManagement", "update");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;

  const filter: FundFlowFilterInput = {
    search: params.search,
    regionId: params.regionId,
    clientId: params.clientId,
    status: params.status as never,
  };

  const [fundFlowResult, regionsResult, clientsResult, staffResult] =
    await Promise.all([
      getFundFlows(filter, page, pageSize),
      getRegions(),
      getClients(),
      getStaff(),
    ]);

  const rows = fundFlowResult.success ? (fundFlowResult.data?.rows ?? []) : [];
  const total = fundFlowResult.success ? (fundFlowResult.data?.total ?? 0) : 0;
  const regions = regionsResult.success ? (regionsResult.data ?? []) : [];
  const clients = clientsResult.success ? (clientsResult.data ?? []) : [];
  const staff = staffResult.success ? (staffResult.data ?? []) : [];

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ModuleHeader
        icon={Landmark}
        title="Fund Flow"
        description="Project financial tracking and fee realization"
        reportCategory="fund-flow"
        reportsHref="/dashboard/fund-flow?tab=reports"
        totalCount={total}
        countLabel="Projects"
      >
        <BulkImportDialog module="fundFlow" moduleLabel="Fund Flow" />
      </ModuleHeader>

      <FundFlowPageTabs
        initialTab={params.tab}
        projects={
          <>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <FundFlowFilters
                  regions={serialize(regions) as { id: string; name: string }[]}
                  clients={serialize(clients) as { id: string; name: string }[]}
                  initialFilter={filter}
                />
              </CardContent>
            </Card>

            {fundFlowResult.success ? (
              <FundFlowTable
                rows={serialize(rows) as never}
                page={page}
                pageSize={pageSize}
                total={total}
                totalPages={totalPages}
                filter={filter}
                regions={serialize(regions) as { id: string; name: string }[]}
                clients={serialize(clients) as { id: string; name: string }[]}
                staff={serialize(staff) as { id: string; name: string | null }[]}
                canManageProjects={canManageProjects}
              />
            ) : (
              <Card className="shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
                  <h3 className="mt-4 text-lg font-medium">Failed to load Fund Flow</h3>
                  <p className="mt-1 max-w-sm text-sm text-zinc-500">
                    {fundFlowResult.error ?? "An unexpected error occurred."}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        }
        reports={<MonthlyIncomeSummary />}
      />
    </div>
  );
}

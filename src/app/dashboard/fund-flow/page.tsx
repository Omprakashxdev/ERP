import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFundFlows } from "@/lib/actions/fund-flow";
import { getRegions } from "@/lib/actions/region";
import { getClients } from "@/lib/actions/client";
import { getStaff } from "@/lib/actions/staff";
import { serialize } from "@/lib/utils";
import { FundFlowTable } from "./fund-flow-table";
import { FundFlowFilters } from "./fund-flow-filters";
import { FundFlowSkeleton } from "./fund-flow-skeleton";
import { FundFlowFilterInput } from "@/lib/schemas/fund-flow";
import { Card, CardContent } from "@/components/ui/card";
import { Landmark, FileSpreadsheet } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";

interface FundFlowPageProps {
  searchParams: Promise<{
    search?: string;
    regionId?: string;
    clientId?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function FundFlowPage({ searchParams }: FundFlowPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <Landmark className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Fund Flow</h1>
            <p className="text-sm text-zinc-500">
              Project financial tracking and fee realization
            </p>
          </div>
        </div>
        <BulkImportDialog module="fundFlow" moduleLabel="Fund Flow" />
      </div>


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
    </div>
  );
}

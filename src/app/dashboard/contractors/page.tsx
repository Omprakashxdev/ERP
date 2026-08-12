import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getContractors } from "@/lib/actions/contractor";
import { serialize } from "@/lib/utils";
import { ContractorsTable } from "./contractors-table";
import { ContractorsFilters } from "./contractors-filters";
import { ContractorsSkeleton } from "./contractors-skeleton";
import { ContractorFilterInput } from "@/lib/schemas/contractor";
import { Card, CardContent } from "@/components/ui/card";
import { HardHat, FileSpreadsheet } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { fetchAllMasters, type MasterData } from "@/lib/master-data";

interface ContractorsPageProps {
  searchParams: Promise<{
    search?: string;
    page?: string;
  }>;
}

export default async function ContractorsPage({
  searchParams,
}: ContractorsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;

  const filter: ContractorFilterInput = {
    search: params.search,
  };

  const [contractorsResult, masters] = await Promise.all([
    getContractors(filter, page, pageSize),
    fetchAllMasters(),
  ]);
  const masterData = masters as unknown as MasterData;

  const rows = contractorsResult.success
    ? (contractorsResult.data?.rows ?? [])
    : [];
  const total = contractorsResult.success
    ? (contractorsResult.data?.total ?? 0)
    : 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <HardHat className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Contractors
            </h1>
            <p className="text-sm text-zinc-500">
              Contractor profiles, work specs, documents, and billing details
            </p>
          </div>
        </div>
        <BulkImportDialog module="contractors" moduleLabel="Contractors" />
      </div>


      <Card className="shadow-sm">
        <CardContent className="p-4">
          <ContractorsFilters initialFilter={filter} />
        </CardContent>
      </Card>

      {contractorsResult.success ? (
        <ContractorsTable
          rows={serialize(rows) as never}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          filter={filter}
          masters={masterData}
        />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">Failed to load Contractors</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {contractorsResult.error ?? "An unexpected error occurred."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

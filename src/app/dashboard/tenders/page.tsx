import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTenders } from "@/lib/actions/tender";
import { serialize } from "@/lib/utils";
import { TendersTable } from "./tenders-table";
import { TendersFilters } from "./tenders-filters";
import { TendersSkeleton } from "./tenders-skeleton";
import { TenderFilterInput } from "@/lib/schemas/tender";
import { Card, CardContent } from "@/components/ui/card";
import { FileSpreadsheet, ClipboardList } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { fetchAllMasters, type MasterData } from "@/lib/master-data";

interface TendersPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    workType?: string;
    serviceType?: string;
    city?: string;
    state?: string;
    platform?: string;
    fromDate?: string;
    toDate?: string;
    page?: string;
  }>;
}

export default async function TendersPage({
  searchParams,
}: TendersPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;

  function parseDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  const filter: TenderFilterInput = {
    search: params.search,
    status: params.status as never,
    workType: params.workType as never,
    serviceType: params.serviceType as never,
    city: params.city,
    state: params.state,
    platform: params.platform,
    fromDate: parseDate(params.fromDate),
    toDate: parseDate(params.toDate),
  };

  const [tendersResult, masters] = await Promise.all([
    getTenders(filter, page, pageSize),
    fetchAllMasters(),
  ]);
  const masterData = masters as unknown as MasterData;

  const rows = tendersResult.success
    ? (tendersResult.data?.rows ?? [])
    : [];
  const total = tendersResult.success
    ? (tendersResult.data?.total ?? 0)
    : 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Tender Management
            </h1>
            <p className="text-sm text-zinc-500">
              Track tender opportunities, fees, EMD, and price comparison
            </p>
          </div>
        </div>
        <BulkImportDialog module="tenders" moduleLabel="Tenders" />
      </div>


      <Card className="shadow-sm">
        <CardContent className="p-4">
          <TendersFilters initialFilter={filter} />
        </CardContent>
      </Card>

      {tendersResult.success ? (
        <TendersTable
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
            <h3 className="mt-4 text-lg font-medium">Failed to load Tenders</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {tendersResult.error ?? "An unexpected error occurred."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

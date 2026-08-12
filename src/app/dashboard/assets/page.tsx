import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAssets } from "@/lib/actions/asset";
import { getStaff } from "@/lib/actions/staff";
import { serialize } from "@/lib/utils";
import { AssetsTable } from "./assets-table";
import { AssetsFilters } from "./assets-filters";
import { AssetsSkeleton } from "./assets-skeleton";
import { AssetFilterInput } from "@/lib/schemas/asset";
import { Card, CardContent } from "@/components/ui/card";
import { Box } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { fetchAllMasters, type MasterData } from "@/lib/master-data";

interface AssetsPageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    status?: string;
    yearOfPurchase?: string;
    page?: string;
  }>;
}

export default async function AssetsPage({
  searchParams,
}: AssetsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;

  const filter: AssetFilterInput = {
    search: params.search,
    category: params.category,
    status: params.status as never,
    yearOfPurchase: params.yearOfPurchase
      ? Number(params.yearOfPurchase)
      : undefined,
  };

  const [assetsResult, masters, staffResult] = await Promise.all([
    getAssets(filter, page, pageSize),
    fetchAllMasters(),
    getStaff(),
  ]);
  const masterData = masters as unknown as MasterData;
  const staff = staffResult.success ? (staffResult.data ?? []) : [];

  const rows = assetsResult.success
    ? (assetsResult.data?.rows ?? [])
    : [];
  const total = assetsResult.success
    ? (assetsResult.data?.total ?? 0)
    : 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Property &amp; Asset List
            </h1>
            <p className="text-sm text-zinc-500">
              Track organizational assets, assignments, and warranty documents
            </p>
          </div>
        </div>
        <BulkImportDialog module="assets" moduleLabel="Assets" />
      </div>


      <Card className="shadow-sm">
        <CardContent className="p-4">
          <AssetsFilters initialFilter={filter} />
        </CardContent>
      </Card>

      {assetsResult.success ? (
        <AssetsTable
          rows={serialize(rows) as never}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          filter={filter}
          masters={masterData}
          staff={serialize(staff) as { id: string; name: string }[]}
        />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Box className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">Failed to load assets</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {assetsResult.error ?? "An unexpected error occurred."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

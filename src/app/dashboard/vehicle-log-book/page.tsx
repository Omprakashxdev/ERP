import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getVehicles, getJourneyLogs } from "@/lib/actions/vehicle-log-book";
import { getStaff } from "@/lib/actions/staff";
import { getMasterList } from "@/lib/actions/masters";
import { serialize } from "@/lib/utils";
import { VehicleLogBookTable } from "./vehicle-log-book-table";
import { VehicleLogBookFilters } from "./vehicle-log-book-filters";
import { VehicleLogBookSkeleton } from "./skeleton";
import {
  VehicleFilterInput,
  JourneyLogFilterInput,
} from "@/lib/schemas/vehicle-log-book";
import { Card, CardContent } from "@/components/ui/card";
import { Car, FileSpreadsheet } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";

interface VehicleLogBookPageProps {
  searchParams: Promise<{
    tab?: string;
    search?: string;
    status?: string;
    vehicleId?: string;
    approvalStatus?: string;
    journeyDateFrom?: string;
    journeyDateTo?: string;
    page?: string;
  }>;
}

export default async function VehicleLogBookPage({
  searchParams,
}: VehicleLogBookPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;
  const activeTab = params.tab === "journeys" ? "journeys" : "vehicles";

  function parseDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  const vehicleFilter: VehicleFilterInput = {
    search: params.search,
    status: params.status as never,
  };

  const journeyLogFilter: JourneyLogFilterInput = {
    search: params.search,
    vehicleId: params.vehicleId,
    approvalStatus: params.approvalStatus as never,
    journeyDateFrom: parseDate(params.journeyDateFrom),
    journeyDateTo: parseDate(params.journeyDateTo),
  };

  const filterForAi =
    activeTab === "journeys"
      ? { search: params.search }
      : vehicleFilter;

  // When on journeys tab, fetch all vehicles without filters so the
  // vehicle dropdown in the JourneyLogForm is always fully populated.
  const vehicleFetchFilter = activeTab === "vehicles" ? vehicleFilter : {};

  const [vehiclesResult, journeyLogsResult, staffResult, citiesResult] = await Promise.all([
    getVehicles(vehicleFetchFilter, activeTab === "vehicles" ? page : 1, activeTab === "vehicles" ? pageSize : 1000),
    getJourneyLogs(
      journeyLogFilter,
      activeTab === "journeys" ? page : 1,
      pageSize
    ),
    getStaff(),
    getMasterList("city"),
  ]);

  const vehicleRows = vehiclesResult.success
    ? (vehiclesResult.data?.rows ?? [])
    : [];
  const vehicleTotal = vehiclesResult.success
    ? (vehiclesResult.data?.total ?? 0)
    : 0;

  const journeyRows = journeyLogsResult.success
    ? (journeyLogsResult.data?.rows ?? [])
    : [];
  const journeyTotal = journeyLogsResult.success
    ? (journeyLogsResult.data?.total ?? 0)
    : 0;

  const staff = staffResult.success ? (staffResult.data ?? []) : [];
  const cities = citiesResult.success
    ? (citiesResult.data as { id: string; name: string }[] ?? [])
    : [];

  const total = activeTab === "journeys" ? journeyTotal : vehicleTotal;
  const totalPages = Math.ceil(total / pageSize);

  const error =
    activeTab === "journeys"
      ? journeyLogsResult.error
      : vehiclesResult.error;
  const success =
    activeTab === "journeys"
      ? journeyLogsResult.success
      : vehiclesResult.success;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <Car className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Vehicle Log Book
            </h1>
            <p className="text-sm text-zinc-500">
              Manage vehicle records, journey logs, expenses, and approvals
            </p>
          </div>
        </div>
        <BulkImportDialog module="vehicleLogBook" moduleLabel="Vehicle Log Book" />
      </div>


      <Card className="shadow-sm">
        <CardContent className="p-4">
          <VehicleLogBookFilters
            initialFilter={activeTab === "journeys" ? journeyLogFilter : vehicleFilter}
            activeTab={activeTab}
            vehicles={serialize(vehicleRows) as { id: string; registrationNumber: string }[]}
          />
        </CardContent>
      </Card>

      {success ? (
        <VehicleLogBookTable
          vehicles={serialize(vehicleRows) as never}
          journeyLogs={serialize(journeyRows) as never}
          activeTab={activeTab}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          vehicleFilter={vehicleFilter}
          journeyLogFilter={journeyLogFilter}
          staff={serialize(staff) as { id: string; name: string }[]}
          cities={cities.map((c) => ({ id: c.id, name: c.name }))}
        />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">Failed to load Vehicle Log Book</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {error ?? "An unexpected error occurred."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPaymentSchedules } from "@/lib/actions/payment-schedule";
import { serialize } from "@/lib/utils";
import { PaymentSchedulesTable } from "./payment-schedules-table";
import { PaymentSchedulesFilters } from "./payment-schedules-filters";
import { PaymentSchedulesSkeleton } from "./payment-schedules-skeleton";
import { PaymentScheduleFilterInput } from "@/lib/schemas/payment-schedule";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, FileSpreadsheet } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";

interface PaymentSchedulesPageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    page?: string;
  }>;
}

export default async function PaymentSchedulesPage({
  searchParams,
}: PaymentSchedulesPageProps) {
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

  const filter: PaymentScheduleFilterInput = {
    search: params.search,
    category: params.category as never,
    status: params.status as never,
    fromDate: parseDate(params.fromDate),
    toDate: parseDate(params.toDate),
    dueDateFrom: parseDate(params.dueDateFrom),
    dueDateTo: parseDate(params.dueDateTo),
  };

  const paymentSchedulesResult = await getPaymentSchedules(filter, page, pageSize);

  const rows = paymentSchedulesResult.success
    ? (paymentSchedulesResult.data?.rows ?? [])
    : [];
  const total = paymentSchedulesResult.success
    ? (paymentSchedulesResult.data?.total ?? 0)
    : 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Payment Schedules
            </h1>
            <p className="text-sm text-zinc-500">
              Track scheduled payments, due dates, and bill copies by category
            </p>
          </div>
        </div>
        <BulkImportDialog module="paymentSchedules" moduleLabel="Payment Schedules" />
      </div>


      <Card className="shadow-sm">
        <CardContent className="p-4">
          <PaymentSchedulesFilters initialFilter={filter} />
        </CardContent>
      </Card>

      {paymentSchedulesResult.success ? (
        <PaymentSchedulesTable
          rows={serialize(rows) as never}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          filter={filter}
        />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">
              Failed to load Payment Schedules
            </h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {paymentSchedulesResult.error ?? "An unexpected error occurred."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

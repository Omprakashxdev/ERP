import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInOutRegisters } from "@/lib/actions/in-out-register";
import { serialize } from "@/lib/utils";
import { InOutRegisterTable } from "./in-out-register-table";
import { InOutRegisterFilters } from "./in-out-register-filters";
import { InOutRegisterSkeleton } from "./in-out-register-skeleton";
import { InOutRegisterFilterInput } from "@/lib/schemas/in-out-register";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeftRight } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";

interface InOutRegisterPageProps {
  searchParams: Promise<{
    search?: string;
    direction?: "INWARD" | "OUTWARD";
    clientId?: string;
    actionSuggestedStaffId?: string;
    ccStaffId?: string;
    hasReply?: string;
    receivedDateFrom?: string;
    receivedDateTo?: string;
    ageDue?: string;
    page?: string;
  }>;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function InOutRegisterPage({
  searchParams,
}: InOutRegisterPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;

  const filter: InOutRegisterFilterInput = {
    search: params.search,
    direction: params.direction,
    clientId: params.clientId,
    actionSuggestedStaffId: params.actionSuggestedStaffId,
    ccStaffId: params.ccStaffId,
    hasReply: params.hasReply as "true" | "false" | undefined,
    receivedDateFrom: parseDate(params.receivedDateFrom),
    receivedDateTo: parseDate(params.receivedDateTo),
    ageDue: params.ageDue as "15" | "20" | "25" | undefined,
  };

  const [entriesResult, clients, staff] = await Promise.all([
    getInOutRegisters(filter, page, pageSize),
    prisma.client.findMany({
      select: { id: true, name: true, abbreviation: true },
      orderBy: { name: "asc" },
    }),
    prisma.staff.findMany({
      select: { id: true, name: true, employeeCode: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = entriesResult.success
    ? (entriesResult.data?.rows ?? [])
    : [];
  const total = entriesResult.success
    ? (entriesResult.data?.total ?? 0)
    : 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <ArrowLeftRight className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              In-Out Register
            </h1>
            <p className="text-sm text-zinc-500">
              Track inward documents, staff CC/action assignments, and replies
            </p>
          </div>
        </div>
        <BulkImportDialog module="inOutRegister" moduleLabel="In-Out Register" />
      </div>


      <Card className="shadow-sm">
        <CardContent className="p-4">
          <InOutRegisterFilters
            initialFilter={filter}
            clients={serialize(clients) as { id: string; name: string; abbreviation: string | null }[]}
            staff={serialize(staff) as { id: string; name: string; employeeCode: string | null }[]}
          />
        </CardContent>
      </Card>

      {entriesResult.success ? (
        <InOutRegisterTable
          rows={serialize(rows) as never}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          filter={filter}
          clients={serialize(clients) as { id: string; name: string; abbreviation: string | null }[]}
          staff={serialize(staff) as { id: string; name: string; employeeCode: string | null }[]}
        />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ArrowLeftRight className="h-12 w-12 text-zinc-300" />
            <h3 className="mt-4 text-lg font-medium">Failed to load entries</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {entriesResult.error ?? "An unexpected error occurred."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

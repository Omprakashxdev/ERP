import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInOutRegisters } from "@/lib/actions/in-out-register";
import { serialize } from "@/lib/utils";
import { InOutRegisterTable } from "./in-out-register-table";
import { InOutRegisterFilters } from "./in-out-register-filters";
import { InOutRegisterTabs } from "./in-out-register-tabs";
import { InOutRegisterSkeleton } from "./in-out-register-skeleton";
import { InOutRegisterFilterInput } from "@/lib/schemas/in-out-register";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeftRight } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { ModuleHeader } from "@/components/module-header";

interface InOutRegisterPageProps {
  searchParams: Promise<{
    search?: string;
    direction?: "INWARD" | "OUTWARD" | "null";
    clientId?: string;
    department?: string;
    actionSuggestedStaffId?: string;
    ccStaffId?: string;
    hasDeadline?: string;
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
    department: params.department,
    actionSuggestedStaffId: params.actionSuggestedStaffId,
    ccStaffId: params.ccStaffId,
    hasDeadline: params.hasDeadline as "true" | "false" | undefined,
    receivedDateFrom: parseDate(params.receivedDateFrom),
    receivedDateTo: parseDate(params.receivedDateTo),
    ageDue: params.ageDue as "15" | "20" | "25" | undefined,
  };

  const [
    entriesResult,
    clients,
    departments,
    staff,
    allStaff,
    modes,
    allCount,
    inwardCount,
    outwardCount,
    unclassifiedCount,
    pendingCount,
  ] = await Promise.all([
    getInOutRegisters(filter, page, pageSize),
    prisma.client.findMany({
      select: { id: true, name: true, abbreviation: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, name: true, employeeCode: true },
      orderBy: { name: "asc" },
    }),
    prisma.staff.findMany({
      select: { id: true, name: true, employeeCode: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.modeMaster.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.inOutRegister.count(),
    prisma.inOutRegister.count({ where: { direction: "INWARD" } }),
    prisma.inOutRegister.count({ where: { direction: "OUTWARD" } }),
    prisma.inOutRegister.count({ where: { direction: null } }),
    prisma.inOutRegister.count({
      where: {
        direction: "INWARD",
        replyDueDate: { not: null },
        replies: { none: {} },
      },
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
      <ModuleHeader
        icon={ArrowLeftRight}
        title="In-Out Register"
        description="Track inward documents, staff CC/action assignments, and replies"
        reportCategory="in-out-register"
        totalCount={total}
        countLabel="Entries"
      >
        <BulkImportDialog module="inOutRegister" moduleLabel="In-Out Register" />
      </ModuleHeader>

      <InOutRegisterTabs
        counts={{
          all: allCount,
          inward: inwardCount,
          outward: outwardCount,
          unclassified: unclassifiedCount,
          pending: pendingCount,
        }}
      />

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <InOutRegisterFilters
            key={`${filter.direction ?? "all"}-${filter.hasDeadline ?? "none"}`}
            initialFilter={filter}
            clients={serialize(clients) as { id: string; name: string; abbreviation: string | null }[]}
            departments={serialize(departments) as { id: string; name: string }[]}
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
          departments={serialize(departments) as { id: string; name: string }[]}
          staff={serialize(staff) as { id: string; name: string; employeeCode: string | null }[]}
          allStaff={serialize(allStaff) as { id: string; name: string; employeeCode: string | null; isActive: boolean }[]}
          modes={serialize(modes) as { id: string; name: string }[]}
          canDelete={session.user.role === "ADMIN"}
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

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTadaClaims } from "@/lib/actions/tada-bills";
import { getStaff } from "@/lib/actions/staff";
import { serialize } from "@/lib/utils";
import { TadaClaimTable } from "./tada-bills-table";
import { TadaBillsFilters } from "./tada-bills-filters";
import { TadaBillsSkeleton } from "./tada-bills-skeleton";
import { TadaClaimFilterInput } from "@/lib/schemas/tada-bills";
import { Card, CardContent } from "@/components/ui/card";
import { ReceiptText, Plus } from "lucide-react";
import { TadaClaimFormDialog } from "./tada-bills-form";
import { BulkImportDialog } from "@/components/bulk-import-dialog";

interface TadaBillsPageProps {
  searchParams: Promise<{
    search?: string;
    staffId?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function TadaBillsPage({ searchParams }: TadaBillsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;

  const filter: TadaClaimFilterInput = {
    search: params.search,
    staffId: params.staffId,
    status: params.status as never,
  };

  const [claimsResult, staffResult] = await Promise.all([
    getTadaClaims(filter, page, pageSize),
    getStaff(),
  ]);

  const claims = claimsResult.success ? claimsResult.data!.rows : [];
  const total = claimsResult.success ? claimsResult.data!.total : 0;
  const staff = staffResult.success ? staffResult.data! : [];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <ReceiptText className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">TADA Bills</h1>
            <p className="text-sm text-zinc-500">
              Travel and daily allowance claims
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BulkImportDialog module="tadaBills" moduleLabel="TADA Bills" />
          <TadaClaimFormDialog staff={serialize(staff) as never} />
        </div>
      </div>

      <TadaBillsFilters staff={serialize(staff) as never} />


      <Suspense key={`tada-${page}`} fallback={<TadaBillsSkeleton />}>
        <TadaClaimTable
          claims={serialize(claims) as never}
          total={total}
          page={page}
          pageSize={pageSize}
          staff={serialize(staff) as never}
          userRole={session.user.role}
        />
      </Suspense>
    </div>
  );
}

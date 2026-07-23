import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { REPORT_DEFINITIONS, REPORT_CATEGORIES } from "@/lib/reports";
import { ReportsClient } from "./reports-client";
import { BarChart3 } from "lucide-react";

interface ReportsPageProps {
  searchParams: Promise<{
    category?: string;
    report?: string;
  }>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const selectedCategory = params.category ?? "in-out-register";

  const reports = REPORT_DEFINITIONS.filter(
    (r) => r.category === selectedCategory
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-zinc-500">
            Generate and view reports across all modules
          </p>
        </div>
      </div>

      <ReportsClient
        categories={REPORT_CATEGORIES}
        reports={reports}
        selectedCategory={selectedCategory}
        selectedReportId={params.report}
      />
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REPORT_DEFINITIONS, REPORT_CATEGORIES } from "@/lib/reports";
import { ReportsClient } from "./reports-client";
import { buttonVariants } from "@/components/ui/button";
import { BarChart3, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

import { BackToModuleButton } from "./back-to-module-button";

interface ReportsPageProps {
  searchParams: Promise<{
    category?: string;
    report?: string;
    from?: string;
    returnTo?: string;
    returnLabel?: string;
  }>;
}

const CATEGORY_TO_ROUTE: Record<string, { label: string; href: string }> = {
  "in-out-register": { label: "In-Out Register", href: "/dashboard/in-out-register" },
  "vehicle-log-book": { label: "Vehicle Log Book", href: "/dashboard/vehicle-log-book" },
  assets: { label: "Property", href: "/dashboard/property" },
  "due-bills": { label: "Due Bills", href: "/dashboard/due-bills" },
  "fund-flow": { label: "Fund Flow", href: "/dashboard/fund-flow" },
  tenders: { label: "Tenders", href: "/dashboard/tenders" },
  "payment-schedules": { label: "Payment Schedules", href: "/dashboard/payment-schedules" },
  wip: { label: "Work In Progress", href: "/dashboard/wip" },
  "tada-bills": { label: "TADA Bills", href: "/dashboard/tada-bills" },
  tasks: { label: "Tasks", href: "/dashboard/tasks" },
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [params, clients, staff, masterDepartments, registerDepartments] = await Promise.all([
    searchParams,
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.staff.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.inOutRegister.findMany({
      where: { department: { not: null } },
      select: { department: true },
      distinct: ["department"],
    }),
  ]);

  const allDeptNames = Array.from(
    new Set([
      ...masterDepartments.map((d) => d.name.trim()),
      ...registerDepartments
        .map((r) => r.department?.trim())
        .filter((d): d is string => Boolean(d)),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const departments = allDeptNames.map((name) => ({ id: name, name }));
  // ONLY activate the single-module view if explicitly coming from a module's "View Reports" button
  const isModuleFiltered = params.from === "module";
  const rawCategory = params.category ? params.category.replace(/_/g, "-") : "in-out-register";
  const selectedCategory = rawCategory;
  const matchedModule = CATEGORY_TO_ROUTE[selectedCategory];

  const effectiveReturnHref = params.returnTo || matchedModule?.href || "/dashboard";
  const effectiveReturnLabel = params.returnLabel || matchedModule?.label || "Previous Module";

  const reports = REPORT_DEFINITIONS.filter(
    (r) => r.category === selectedCategory
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {isModuleFiltered
                ? `${effectiveReturnLabel} Reports`
                : "Reports & Summary"}
            </h1>
            <p className="text-sm text-zinc-500">
              {isModuleFiltered
                ? `Filter, analyze, and export reports for ${effectiveReturnLabel}`
                : "Generate, filter, and export reports across all operational modules"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isModuleFiltered && (
            <BackToModuleButton
              returnTo={effectiveReturnHref}
              label={effectiveReturnLabel}
            />
          )}

          {isModuleFiltered && (
            <Link
              href={`/dashboard/reports?category=${selectedCategory}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1.5 text-zinc-600 hover:text-zinc-900"
              )}
            >
              <BarChart3 className="h-4 w-4" />
              <span>View All Reports</span>
            </Link>
          )}
        </div>
      </div>

      <ReportsClient
        categories={REPORT_CATEGORIES}
        reports={reports}
        selectedCategory={selectedCategory}
        selectedReportId={params.report}
        isModuleFiltered={isModuleFiltered}
        moduleLabel={matchedModule?.label}
        clients={clients}
        staff={staff}
        departments={departments}
      />
    </div>
  );
}

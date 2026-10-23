import Link from "next/link";
import { type LucideIcon, BarChart3, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DEFAULT_HREF_MAP: Record<string, string> = {
  "due-bills": "/dashboard/due-bills",
  "fund-flow": "/dashboard/fund-flow",
  "in-out-register": "/dashboard/in-out-register",
  "payment-schedules": "/dashboard/payment-schedules",
  assets: "/dashboard/property",
  "tada-bills": "/dashboard/tada-bills",
  tasks: "/dashboard/tasks",
  tenders: "/dashboard/tenders",
  "vehicle-log-book": "/dashboard/vehicle-log-book",
  wip: "/dashboard/wip",
};

export interface ModuleHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  reportCategory?: string;
  returnHref?: string;
  /** Overrides the default /dashboard/reports link for "View Reports". */
  reportsHref?: string;
  totalCount?: number;
  countLabel?: string;
  children?: React.ReactNode;
}

export function ModuleHeader({
  icon: Icon,
  title,
  description,
  reportCategory,
  returnHref,
  reportsHref,
  totalCount,
  countLabel = "Records",
  children,
}: ModuleHeaderProps) {
  const effectiveReturnHref =
    returnHref || (reportCategory ? DEFAULT_HREF_MAP[reportCategory] : "");
  const viewReportsUrl =
    reportsHref ??
    `/dashboard/reports?category=${reportCategory}&from=module${
      effectiveReturnHref ? `&returnTo=${encodeURIComponent(effectiveReturnHref)}` : ""
    }&returnLabel=${encodeURIComponent(title)}`;

  return (
    <div className="space-y-4">
      {/* Top Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                {title}
              </h1>
              {typeof totalCount === "number" && (
                <Badge
                  variant="secondary"
                  className="font-normal text-xs bg-zinc-100 text-zinc-700"
                >
                  {totalCount.toLocaleString()} {countLabel}
                </Badge>
              )}
            </div>
            <p className="text-sm text-zinc-500">{description}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {reportCategory && (
            <Link
              href={viewReportsUrl}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-2 border-emerald-200 text-emerald-800 bg-emerald-50/60 hover:bg-emerald-100 hover:text-emerald-900 transition-colors shadow-sm"
              )}
            >
              <BarChart3 className="h-4 w-4 text-emerald-600" />
              <span>View Reports</span>
            </Link>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

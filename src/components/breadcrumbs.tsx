"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const labelMap: Record<string, string> = {
  dashboard: "Dashboard",
  "fund-flow": "Fund Flow",
  "due-bills": "Due Bills",
  wip: "Work in Progress",
  contractors: "Contractors",
  tenders: "Tenders",
  "payment-schedules": "Payment Schedules",
  "vehicle-log-book": "Vehicle Log Book",
  assets: "Property",
  property: "Property",
  "in-out-register": "In-Out Register",
  "tada-bills": "TADA Bills",
  tasks: "Tasks",
  reports: "Reports",
  settings: "Settings",
  masters: "Masters",
  clients: "Clients",
  employee: "Employee",
};

const defaultModuleHrefMap: Record<string, string> = {
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

function BreadcrumbsContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length <= 1) {
    return null;
  }

  const crumbs: { href: string; label: string; isLast: boolean }[] = [];

  // Build standard crumbs
  segments.forEach((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = labelMap[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ href, label, isLast: i === segments.length - 1 });
  });

  // If on /dashboard/reports with module context, insert the originating module crumb before Reports
  if (pathname === "/dashboard/reports") {
    const returnTo = searchParams.get("returnTo");
    const returnLabel = searchParams.get("returnLabel");
    const category = searchParams.get("category");
    const isFromModule = searchParams.get("from") === "module";

    if (isFromModule || returnTo || category) {
      const moduleHref =
        returnTo || (category ? defaultModuleHrefMap[category] : "");
      const moduleLabel =
        returnLabel || (category ? labelMap[category] || category : "");

      if (moduleHref && moduleLabel) {
        // Insert module before Reports (at index 1)
        crumbs.splice(1, 0, {
          href: moduleHref,
          label: moduleLabel,
          isLast: false,
        });
      }
    }
  }

  return (
    <nav className="flex items-center gap-1 text-xs text-zinc-400">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 transition-colors hover:text-zinc-600"
      >
        <Home className="h-3 w-3" />
      </Link>
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <div key={`${crumb.href}-${idx}`} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-zinc-300" />
            {isLast ? (
              <span className="font-medium text-zinc-600">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="transition-colors hover:text-zinc-600"
              >
                {crumb.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function Breadcrumbs() {
  return (
    <Suspense fallback={null}>
      <BreadcrumbsContent />
    </Suspense>
  );
}

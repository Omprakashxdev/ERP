"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const labelMap: Record<string, string> = {
  "dashboard": "Dashboard",
  "fund-flow": "Fund Flow",
  "due-bills": "Due Bills",
  "wip": "Work in Progress",
  "contractors": "Contractors",
  "tenders": "Tenders",
  "payment-schedules": "Payment Schedules",
  "vehicle-log-book": "Vehicle Log Book",
  "assets": "Assets",
  "in-out-register": "In-Out Register",
  "tada-bills": "TADA Bills",
  "tasks": "Tasks",
  "reports": "Reports",
  "settings": "Settings",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length <= 1) {
    return null;
  }

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = labelMap[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav className="flex items-center gap-1 text-xs text-zinc-400">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 transition-colors hover:text-zinc-600"
      >
        <Home className="h-3 w-3" />
      </Link>
      {crumbs.map((crumb) => (
        <div key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-zinc-300" />
          {crumb.isLast ? (
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
      ))}
    </nav>
  );
}

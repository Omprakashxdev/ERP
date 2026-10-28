import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface CrumbItem {
  label: string;
  href?: string;
}

export function HierarchyBreadcrumbs({ items }: { items: CrumbItem[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
      <Link
        href="/dashboard/progress-app"
        className="transition-colors hover:text-zinc-700"
      >
        Progress App
      </Link>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-zinc-300" />
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="transition-colors hover:text-zinc-700"
              >
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-zinc-700">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

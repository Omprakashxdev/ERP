"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, Inbox, Send, Clock, AlertCircle } from "lucide-react";

interface InOutRegisterTabsProps {
  counts: {
    all: number;
    inward: number;
    outward: number;
    pending: number;
  };
}

export function InOutRegisterTabs({ counts }: InOutRegisterTabsProps) {
  const searchParams = useSearchParams();

  const direction = searchParams.get("direction");
  const hasDeadline = searchParams.get("hasDeadline");

  let activeTab: "all" | "inward" | "outward" | "pending" = "all";
  if (direction === "INWARD" && hasDeadline === "true") {
    activeTab = "pending";
  } else if (direction === "INWARD") {
    activeTab = "inward";
  } else if (direction === "OUTWARD") {
    activeTab = "outward";
  } else {
    activeTab = "all";
  }

  function createTabUrl(tab: "all" | "inward" | "outward" | "pending") {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    if (tab === "all") {
      params.delete("direction");
      params.delete("hasDeadline");
    } else if (tab === "inward") {
      params.set("direction", "INWARD");
      params.delete("hasDeadline");
    } else if (tab === "outward") {
      params.set("direction", "OUTWARD");
      params.delete("hasDeadline");
    } else if (tab === "pending") {
      params.set("direction", "INWARD");
      params.set("hasDeadline", "true");
    }

    const qs = params.toString();
    return qs ? `/dashboard/in-out-register?${qs}` : "/dashboard/in-out-register";
  }

  const tabs = [
    {
      key: "all" as const,
      label: "All Entries",
      icon: ArrowLeftRight,
      count: counts.all,
      countVariant: "default",
    },
    {
      key: "inward" as const,
      label: "Inward Register",
      icon: Inbox,
      count: counts.inward,
      countVariant: "inward",
    },
    {
      key: "outward" as const,
      label: "Outward Register",
      icon: Send,
      count: counts.outward,
      countVariant: "outward",
    },
    {
      key: "pending" as const,
      label: "Pending for Reply",
      icon: Clock,
      count: counts.pending,
      countVariant: "pending",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200/80 pb-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.key}
            href={createTabUrl(tab.key)}
            className={cn(
              "group relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all duration-150 select-none",
              isActive
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200/80"
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 transition-colors",
                isActive
                  ? "text-zinc-100"
                  : tab.key === "pending" && counts.pending > 0
                  ? "text-amber-600 group-hover:text-amber-700"
                  : "text-zinc-400 group-hover:text-zinc-600"
              )}
            />
            <span>{tab.label}</span>
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums min-w-[20px]",
                isActive
                  ? "bg-zinc-800 text-zinc-100"
                  : tab.key === "pending" && counts.pending > 0
                  ? "bg-amber-100 text-amber-800"
                  : tab.key === "outward"
                  ? "bg-blue-50 text-blue-700"
                  : tab.key === "inward"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-zinc-100 text-zinc-600"
              )}
            >
              {tab.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

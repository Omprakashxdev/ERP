"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderKanban, BarChart3 } from "lucide-react";

interface FundFlowPageTabsProps {
  /** "reports" deep-links into the Monthly Reports tab (e.g. ?tab=reports). */
  initialTab?: string;
  projects: ReactNode;
  reports: ReactNode;
}

/**
 * Module-level tabs on /dashboard/fund-flow.
 * Pure client-side switching — panels stay mounted so project editors and
 * the monthly report keep their state; no data is written on tab changes.
 */
export function FundFlowPageTabs({
  initialTab,
  projects,
  reports,
}: FundFlowPageTabsProps) {
  const [activeTab, setActiveTab] = useState(
    initialTab === "reports" ? "reports" : "projects"
  );
  // Mount the report only after its first visit, then keep it alive so
  // switching back does not reload data.
  const [reportsVisited, setReportsVisited] = useState(
    initialTab === "reports"
  );

  // ?tab=reports deep links (e.g. the "View Reports" action) must switch
  // the tab even when this component is already mounted.
  useEffect(() => {
    if (initialTab === "reports") {
      setActiveTab("reports");
      setReportsVisited(true);
    }
  }, [initialTab]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => {
        const next = v ?? "projects";
        setActiveTab(next);
        if (next === "reports") setReportsVisited(true);
      }}
      className="space-y-5"
    >
      <TabsList className="grid h-auto w-full max-w-xl grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-2">
        <TabsTrigger
          value="projects"
          className="h-12 gap-2.5 whitespace-normal rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 shadow-sm data-active:border-blue-300 data-active:bg-blue-50 data-active:text-blue-900 sm:text-base"
        >
          <FolderKanban aria-hidden className="h-5 w-5 shrink-0" />
          Projects &amp; Fund Flow
        </TabsTrigger>
        <TabsTrigger
          value="reports"
          className="h-12 gap-2.5 whitespace-normal rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 shadow-sm data-active:border-emerald-300 data-active:bg-emerald-50 data-active:text-emerald-900 sm:text-base"
        >
          <BarChart3 aria-hidden className="h-5 w-5 shrink-0" />
          Monthly Reports
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="projects"
        keepMounted
        className="m-0 space-y-6 [&[hidden]]:hidden"
      >
        {projects}
      </TabsContent>
      <TabsContent
        value="reports"
        keepMounted
        className="m-0 [&[hidden]]:hidden"
      >
        {reportsVisited ? reports : null}
      </TabsContent>
    </Tabs>
  );
}

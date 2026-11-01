"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FundFlowWithComputed } from "@/types/fund-flow";
import { ProjectSummaryView } from "@/components/masters/project-summary-view";
import { FundFlowForm } from "./fund-flow-form";
import { ExternalLink } from "lucide-react";

interface FundFlowEditorProps {
  project: FundFlowWithComputed;
  canManageProjects?: boolean;
  onClose: () => void;
}

/**
 * Fund Flow editing surface — focused on financial entry, reconciliation,
 * and monthly allocations while exposing a read-only project master summary
 * with an authorized link to edit project details under Masters → Projects.
 */
export function FundFlowEditor({
  project,
  canManageProjects = false,
  onClose,
}: FundFlowEditorProps) {
  const [activeTab, setActiveTab] = useState("financial");
  const editInMastersHref = `/dashboard/masters?tab=projects&edit=${encodeURIComponent(project.id)}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-[calc(100%-2.5rem)] lg:max-w-[1180px]">
        <DialogHeader className="border-b bg-white px-5 pb-4 pt-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="text-xl sm:text-2xl">{project.name}</DialogTitle>
              <DialogDescription className="text-sm sm:text-base">
                {project.client?.name ?? "—"} · {project.region?.name ?? "—"} — update financial figures and monthly allocations.
              </DialogDescription>
            </div>
            {canManageProjects && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={editInMastersHref} />}
                nativeButton={false}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Edit in Masters
              </Button>
            )}
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v ?? "financial")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b bg-white px-4 pb-3 pt-3 sm:px-6">
            <TabsList className="grid h-auto w-full grid-cols-1 gap-1.5 bg-transparent p-0 sm:grid-cols-2">
              <TabsTrigger
                value="financial"
                className="h-12 gap-2.5 whitespace-normal rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-left text-sm font-medium text-zinc-700 data-active:border-blue-300 data-active:bg-blue-50 data-active:text-blue-900 sm:text-base"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                  1
                </span>
                Financial details &amp; monthly allocations
              </TabsTrigger>
              <TabsTrigger
                value="project"
                className="h-12 gap-2.5 whitespace-normal rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-left text-sm font-medium text-zinc-700 data-active:border-blue-300 data-active:bg-blue-50 data-active:text-blue-900 sm:text-base"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                  2
                </span>
                Project summary, staff &amp; fee stages (read-only)
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="financial"
            keepMounted
            className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/60 [&[hidden]]:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <FundFlowForm
                project={project}
                onClose={onClose}
                embedded
              />
            </div>
          </TabsContent>

          <TabsContent
            value="project"
            keepMounted
            className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/60 [&[hidden]]:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
              <ProjectSummaryView
                project={project}
                canManageProjects={canManageProjects}
                showEditInMastersLink
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

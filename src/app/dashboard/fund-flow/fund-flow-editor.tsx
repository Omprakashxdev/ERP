"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FundFlowWithComputed } from "@/types/fund-flow";
import { ProjectForm } from "./project-form";
import { FundFlowForm } from "./fund-flow-form";

interface FundFlowEditorProps {
  project: FundFlowWithComputed;
  onClose: () => void;
}

/**
 * Unified project editing surface — one obvious "View / Edit" entry point.
 * Reuses the existing ProjectForm (details/staff/fee stages) and
 * FundFlowForm (workbook figures, reconciliation, monthly allocations)
 * in embedded mode — no duplicated business logic.
 */
export function FundFlowEditor({ project, onClose }: FundFlowEditorProps) {
  const [activeTab, setActiveTab] = useState("financial");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-[calc(100%-2.5rem)] lg:max-w-[1180px]">
        <DialogHeader className="border-b bg-white px-5 pb-4 pt-5 sm:px-6">
          <DialogTitle className="text-xl sm:text-2xl">{project.name}</DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            View and update this project&apos;s information and financial
            details.
          </DialogDescription>
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
                Project information, staff &amp; fee stages
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
            <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6">
              <ProjectForm
                project={project}
                mode="edit"
                onClose={onClose}
                embedded
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

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
      <DialogContent className="flex max-h-[90dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-4 pb-3 pt-4">
          <DialogTitle>{project.name}</DialogTitle>
          <DialogDescription>
            View and update this project's information and financial details.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v ?? "financial")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b px-4 pt-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="financial">
                Financial details &amp; monthly allocations
              </TabsTrigger>
              <TabsTrigger value="project">
                Project information, staff &amp; fee stages
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="financial"
            className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
              <FundFlowForm
                project={project}
                onClose={onClose}
                embedded
              />
            </div>
          </TabsContent>

          <TabsContent
            value="project"
            className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { setProgressTemplateActive } from "@/lib/actions/progress-activity";
import { toast } from "sonner";
import {
  Plus,
  ClipboardList,
  Ban,
  RotateCcw,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { TemplateForm } from "./template-form";

interface TemplateRow {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  isActive: boolean;
  _count?: { items: number; checklists: number };
}

export function TemplatesTable({
  rows,
  canManage,
}: {
  rows: TemplateRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<TemplateRow | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleToggle() {
    if (!toggleTarget) return;
    setToggling(true);
    setToggleError(null);
    const res = await setProgressTemplateActive(
      toggleTarget.id,
      !toggleTarget.isActive
    );
    setToggling(false);
    if (!res.success) {
      setToggleError(res.error ?? "Could not update this template.");
      return;
    }
    toast.success(
      `Template ${toggleTarget.isActive ? "deactivated" : "reactivated"}.`
    );
    setToggleTarget(null);
    router.refresh();
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <ClipboardList className="h-4 w-4" />
            Templates
            <Badge
              variant="secondary"
              className="font-normal text-xs bg-zinc-100 text-zinc-600"
            >
              {rows.length}
            </Badge>
          </CardTitle>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New template
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-12 text-center">
            <ClipboardList className="h-10 w-10 text-zinc-300" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              No checklist templates yet.
            </p>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              Create a template to define the activity checklist for rooms.
            </p>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New template
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-100">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="whitespace-nowrap">Template</TableHead>
                  <TableHead className="whitespace-nowrap">
                    Description
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    Activities
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    Rooms using
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    Version
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={`transition-colors ${
                      row.isActive ? "hover:bg-zinc-50/70" : "opacity-55"
                    }`}
                  >
                    <TableCell className="whitespace-nowrap font-semibold">
                      <Link
                        href={`/dashboard/progress-app/templates/${row.id}`}
                        className="inline-flex items-center gap-1 text-zinc-900 hover:text-zinc-600 hover:underline"
                      >
                        {row.name}
                        <ChevronRight className="h-3 w-3 text-zinc-400" />
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-52 truncate">
                      {row.description ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {row._count?.items ?? 0}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {row._count?.checklists ?? 0}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      v{row.version}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={
                          row.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-zinc-100 text-zinc-500 border-zinc-200"
                        }
                      >
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setToggleTarget(row);
                            setToggleError(null);
                          }}
                          title={
                            row.isActive
                              ? "Deactivate template"
                              : "Reactivate template"
                          }
                        >
                          {row.isActive ? (
                            <Ban className="h-3.5 w-3.5 text-amber-600" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <TemplateForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />

      <Dialog
        open={toggleTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setToggleTarget(null);
            setToggleError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {toggleTarget?.isActive ? "Deactivate" : "Reactivate"} template
            </DialogTitle>
            <DialogDescription>
              {toggleTarget?.isActive
                ? `Deactivate "${toggleTarget?.name}"? It can no longer be assigned to rooms, but every room already using it keeps its checklist and progress history.`
                : `Reactivate "${toggleTarget?.name}"?`}
            </DialogDescription>
          </DialogHeader>
          {toggleError && <p className="text-sm text-red-600">{toggleError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setToggleTarget(null)}
              disabled={toggling}
            >
              Cancel
            </Button>
            <Button
              variant={toggleTarget?.isActive ? "destructive" : "default"}
              onClick={handleToggle}
              disabled={toggling}
            >
              {toggling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {toggleTarget?.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

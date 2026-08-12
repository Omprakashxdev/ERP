"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Loader2, Plus, X, Search } from "lucide-react";
import { toast } from "sonner";
import {
  getProjectsForContractor,
  getUnlinkedProjects,
  linkProjectToContractor,
  unlinkProjectFromContractor,
} from "@/lib/actions/project";

interface ContractorProjectsDialogProps {
  contractorId: string;
  contractorName: string;
  onClose: () => void;
}

interface ProjectRow {
  id: string;
  name: string;
  workOrderDate: string | null;
  status: string;
  workType: string;
  serviceType: string;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatEnum(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

const statusVariantMap: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  COMPLETED: "bg-blue-50 text-blue-700 border-blue-200",
  ON_HOLD: "bg-amber-50 text-amber-700 border-amber-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
};

export function ContractorProjectsDialog({
  contractorId,
  contractorName,
  onClose,
}: ContractorProjectsDialogProps) {
  const router = useRouter();
  const [linkedProjects, setLinkedProjects] = useState<ProjectRow[]>([]);
  const [unlinkedProjects, setUnlinkedProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadData() {
    setLoading(true);
    const [linkedRes, unlinkedRes] = await Promise.all([
      getProjectsForContractor(contractorId),
      getUnlinkedProjects(contractorId),
    ]);
    if (linkedRes.success && linkedRes.data) {
      setLinkedProjects(linkedRes.data as ProjectRow[]);
    }
    if (unlinkedRes.success && unlinkedRes.data) {
      setUnlinkedProjects(unlinkedRes.data as ProjectRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [contractorId]);

  function handleLink(projectId: string) {
    setPendingAction(projectId);
    startTransition(async () => {
      const res = await linkProjectToContractor(projectId, contractorId);
      if (res.success) {
        toast.success("Project linked successfully");
        await loadData();
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to link project");
      }
      setPendingAction(null);
    });
  }

  function handleUnlink(projectId: string) {
    setPendingAction(projectId);
    startTransition(async () => {
      const res = await unlinkProjectFromContractor(projectId);
      if (res.success) {
        toast.success("Project unlinked successfully");
        await loadData();
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to unlink project");
      }
      setPendingAction(null);
    });
  }

  const filteredUnlinked = unlinkedProjects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Projects — {contractorName}</DialogTitle>
          <DialogDescription>
            Manage project associations for this contractor.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Linked projects */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Linked projects ({linkedProjects.length})</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAdd(!showAdd)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add project
                  </Button>
                </div>

                {linkedProjects.length === 0 ? (
                  <p className="text-sm text-zinc-500 py-4 text-center">
                    No projects linked to this contractor yet.
                  </p>
                ) : (
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="whitespace-nowrap">Project</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap">Work Type</TableHead>
                        <TableHead className="whitespace-nowrap">Work Order Date</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkedProjects.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap font-medium">{p.name}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant="outline" className={statusVariantMap[p.status] ?? ""}>
                              {formatEnum(p.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatEnum(p.workType)}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(p.workOrderDate)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleUnlink(p.id)}
                              disabled={isPending && pendingAction === p.id}
                              title="Unlink project"
                            >
                              {isPending && pendingAction === p.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5 text-red-600" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Add project section */}
              {showAdd && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="text-sm font-medium">Available projects</h4>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                    <Input
                      placeholder="Search projects..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 pl-7 text-xs"
                    />
                  </div>

                  {filteredUnlinked.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-4 text-center">
                      No available projects to link.
                    </p>
                  ) : (
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="whitespace-nowrap">Project</TableHead>
                          <TableHead className="whitespace-nowrap">Status</TableHead>
                          <TableHead className="whitespace-nowrap">Work Type</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUnlinked.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="whitespace-nowrap font-medium">{p.name}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant="outline" className={statusVariantMap[p.status] ?? ""}>
                                {formatEnum(p.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{formatEnum(p.workType)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleLink(p.id)}
                                disabled={isPending && pendingAction === p.id}
                                title="Link project"
                              >
                                {isPending && pendingAction === p.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5 text-emerald-600" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

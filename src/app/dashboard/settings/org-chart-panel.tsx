"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Network, User, ChevronRight, ChevronDown, Edit3, X } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";
import { getReportingHierarchy, updateReportingManager, getStaff } from "@/lib/actions/staff";

interface HierarchyNode {
  id: string;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  employeeCode: string | null;
  regionId: string | null;
  region: { name: string } | null;
  reportingManagerId: string | null;
  children: HierarchyNode[];
}

interface StaffOption {
  id: string;
  name: string;
  designation: string | null;
}

export function OrgChartPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<HierarchyNode[]>([]);
  const [allStaff, setAllStaff] = useState<StaffOption[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedManager, setSelectedManager] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [hierarchyRes, staffRes] = await Promise.all([
        getReportingHierarchy(),
        getStaff({ isActive: true }),
      ]);

      if (hierarchyRes.success && hierarchyRes.data) {
        setTree(hierarchyRes.data as HierarchyNode[]);
        // Auto-expand root nodes
        const rootIds = new Set<string>((hierarchyRes.data as HierarchyNode[]).map((n) => n.id));
        setExpanded(rootIds);
      }

      if (staffRes.success && staffRes.data) {
        setAllStaff(
          (staffRes.data as unknown[]).map((s) => ({
            id: (s as Record<string, unknown>).id as string,
            name: (s as Record<string, unknown>).name as string,
            designation: ((s as Record<string, unknown>).designation as string) ?? null,
          }))
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load hierarchy";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function startEditing(node: HierarchyNode) {
    setEditingId(node.id);
    setSelectedManager(node.reportingManagerId ?? "");
  }

  async function saveManager(staffId: string) {
    setSaving(true);
    setError(null);
    try {
      const managerId = selectedManager || null;
      const res = await updateReportingManager(staffId, managerId);
      if (!res.success) {
        setError(res.error ?? "Failed to update reporting manager");
        toast.error(res.error ?? "Failed to update reporting manager");
        return;
      }
      toast.success("Reporting manager updated");
      setEditingId(null);
      router.refresh();
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function renderNode(node: HierarchyNode, depth: number = 0): React.ReactNode {
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const isEditing = editingId === node.id;

    return (
      <div key={node.id} className="select-none">
        <div
          className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition-colors hover:bg-zinc-50"
          style={{ marginLeft: `${depth * 28}px` }}
        >
          {/* Expand/Collapse */}
          <button
            onClick={() => hasChildren && toggleExpand(node.id)}
            className="flex h-5 w-5 items-center justify-center text-zinc-400 hover:text-zinc-700"
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="h-2 w-2 rounded-full bg-zinc-300" />
            )}
          </button>

          {/* Avatar */}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
            <User className="h-4 w-4" />
          </div>

          {/* Name & details */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-zinc-900">{node.name}</span>
              {node.designation && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                  {node.designation}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-zinc-400">
              {node.employeeCode && <span>{node.employeeCode}</span>}
              {node.region?.name && <span>{node.region.name}</span>}
              {hasChildren && (
                <span className="text-blue-500">
                  {node.children.length} report{node.children.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Edit button */}
          {!isEditing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => startEditing(node)}
            >
              <Edit3 className="mr-1 h-3 w-3" />
              Set Manager
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Select
                value={selectedManager}
                onValueChange={(v) => setSelectedManager(v ?? "")}
              >
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue placeholder="Select manager">
                    {(value: string) => {
                      const staff = allStaff.find((s) => s.id === value);
                      if (!staff) return "Select manager";
                      return staff.designation
                        ? `${staff.name} (${staff.designation})`
                        : staff.name;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {allStaff
                    .filter((s) => s.id !== node.id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.designation ? ` (${s.designation})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => saveManager(node.id)}
                disabled={saving}
              >
                {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setEditingId(null)}
                disabled={saving}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div className="mt-1 space-y-1">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const totalStaff = allStaff.length;
  const unassigned = allStaff.filter(
    (s) => !tree.find((n) => n.id === s.id) && !isInTree(tree, s.id)
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Network className="h-5 w-5 text-zinc-500" />
            Reporting Hierarchy
          </h2>
          <p className="text-sm text-zinc-500">
            View and manage reporting relationships. Changes here affect forwarding auto-routing.
          </p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-2xl font-bold text-zinc-900">{totalStaff}</div>
            <div className="text-[10px] text-zinc-400">Total Staff</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-600">{unassigned}</div>
            <div className="text-[10px] text-zinc-400">No Manager</div>
          </div>
        </div>
      </div>

      <ErrorBanner
        error={error}
        onAskAi={(e) => askAi(e, "Managing reporting hierarchy")}
        askingAi={askingAi}
        aiResponse={aiResponse}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : tree.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <Network className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">No staff found. Add staff members to build the hierarchy.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {tree.map((node) => renderNode(node))}
        </div>
      )}

      {unassigned > 0 && !loading && (
        <div className="space-y-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {unassigned} staff member{unassigned > 1 ? "s have" : " has"} no reporting manager set.
            Use the "Set Manager" button on each node to assign one.
          </div>
          <div className="space-y-1">
            {allStaff
              .filter((s) => !isInTree(tree, s.id))
              .map((s) => {
                const isEditing = editingId === s.id;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium text-zinc-900">{s.name}</span>
                      {s.designation && (
                        <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                          {s.designation}
                        </span>
                      )}
                    </div>
                    {!isEditing ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => startEditing({ id: s.id, name: s.name, designation: s.designation, email: null, phone: null, employeeCode: null, regionId: null, region: null, reportingManagerId: null, children: [] })}
                      >
                        <Edit3 className="mr-1 h-3 w-3" />
                        Set Manager
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={selectedManager}
                          onValueChange={(v) => setSelectedManager(v ?? "")}
                        >
                          <SelectTrigger className="h-7 w-40 text-xs">
                            <SelectValue placeholder="Select manager">
                              {(value: string) => {
                                const staff = allStaff.find((s) => s.id === value);
                                if (!staff) return "Select manager";
                                return staff.designation
                                  ? `${staff.name} (${staff.designation})`
                                  : staff.name;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {allStaff
                              .filter((o) => o.id !== s.id)
                              .map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.name}
                                  {o.designation ? ` (${o.designation})` : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => saveManager(s.id)}
                          disabled={saving}
                        >
                          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function isInTree(nodes: HierarchyNode[], id: string): boolean {
  for (const node of nodes) {
    if (node.id === id) return true;
    if (node.children.length > 0 && isInTree(node.children, id)) return true;
  }
  return false;
}

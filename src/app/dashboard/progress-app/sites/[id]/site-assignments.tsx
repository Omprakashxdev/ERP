"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, UserX, RotateCcw, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  assignSiteStaff,
  setSiteAssignmentActive,
  updateSiteAssignmentScope,
} from "@/lib/actions/progress-assignments";

interface AssignmentRow {
  id: string;
  canView: boolean;
  canUpdate: boolean;
  isActive: boolean;
  assignedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    isActive: boolean;
  };
  assignedBy: { name: string | null; email: string };
}

interface HistoryRow {
  id: string;
  type: string;
  canView: boolean;
  canUpdate: boolean;
  createdAt: string;
  changedBy: { name: string | null; email: string };
  assignment: { user: { name: string | null; email: string } };
}

interface Props {
  siteId: string;
  assignments: AssignmentRow[];
  history: HistoryRow[];
  users: { id: string; name: string | null; email: string; role: string }[];
  canManage: boolean;
}

/**
 * ERP staff-assignment panel — grants/revokes mobile view+update scope on
 * this site. Every change is recorded in ProgressSiteAssignmentEvent.
 */
export function SiteAssignments({
  siteId,
  assignments,
  history,
  users,
  canManage,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [canView, setCanView] = useState(true);
  const [canUpdate, setCanUpdate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<AssignmentRow | null>(null);

  const assignedIds = new Set(assignments.map((a) => a.user.id));
  const available = users.filter((u) => !assignedIds.has(u.id));

  const grant = () => {
    if (!userId) return;
    startTransition(async () => {
      const res = await assignSiteStaff({
        siteId,
        userId,
        canView: canUpdate ? true : canView,
        canUpdate,
      });
      if (res.success) {
        toast.success("Staff assigned to site.");
        setOpen(false);
        setUserId(null);
        setCanView(true);
        setCanUpdate(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Assignment failed.");
      }
    });
  };

  const toggleScope = (row: AssignmentRow, field: "canView" | "canUpdate") => {
    const next = { canView: row.canView, canUpdate: row.canUpdate };
    next[field] = !next[field];
    if (next.canUpdate) next.canView = true; // update implies view
    if (!next.canView) next.canUpdate = false;
    startTransition(async () => {
      const res = await updateSiteAssignmentScope({
        assignmentId: row.id,
        ...next,
      });
      if (res.success) {
        toast.success("Permissions updated.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Update failed.");
      }
    });
  };

  const setActive = (row: AssignmentRow, active: boolean) => {
    startTransition(async () => {
      const res = await setSiteAssignmentActive(row.id, active);
      if (res.success) {
        toast.success(active ? "Assignment reactivated." : "Access revoked.");
        setConfirmRevoke(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Operation failed.");
      }
    });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <UserPlus className="h-4 w-4" />
          Assigned staff
          <Badge
            variant="secondary"
            className="font-normal text-xs bg-zinc-100 text-zinc-600"
          >
            {assignments.filter((a) => a.isActive).length} active
          </Badge>
          <span className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowHistory((v) => !v)}
            >
              <History className="h-3.5 w-3.5 mr-1" />
              History
            </Button>
            {canManage && (
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => setOpen(true)}
                disabled={available.length === 0}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                Assign staff
              </Button>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {assignments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-8 text-center text-xs text-zinc-500">
            No staff assigned. Assigned users see this site in the Android
            app.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-zinc-500">
                  <th className="px-3 py-2 font-semibold">Staff</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold text-center">
                    Can view
                  </th>
                  <th className="px-3 py-2 font-semibold text-center">
                    Can update
                  </th>
                  <th className="px-3 py-2 font-semibold">Assigned by</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  {canManage && (
                    <th className="px-3 py-2 font-semibold text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-b border-zinc-50 ${a.isActive ? "" : "opacity-55"}`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-900">
                        {a.user.name ?? a.user.email}
                      </div>
                      <div className="text-zinc-500">{a.user.email}</div>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{a.user.role}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={a.canView}
                        disabled={!canManage || !a.isActive || pending}
                        onChange={() => toggleScope(a, "canView")}
                        aria-label={`View permission for ${a.user.email}`}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={a.canUpdate}
                        disabled={!canManage || !a.isActive || pending}
                        onChange={() => toggleScope(a, "canUpdate")}
                        aria-label={`Update permission for ${a.user.email}`}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {a.assignedBy.name ?? a.assignedBy.email}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          a.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-zinc-100 text-zinc-500 border-zinc-200"
                        }
                      >
                        {a.isActive ? "Active" : "Revoked"}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        {a.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:text-red-700"
                            onClick={() => setConfirmRevoke(a)}
                            disabled={pending}
                          >
                            <UserX className="h-3.5 w-3.5 mr-1" />
                            Revoke
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setActive(a, true)}
                            disabled={pending}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Reactivate
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showHistory && history.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-zinc-500">
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Staff</th>
                  <th className="px-3 py-2 font-semibold">Event</th>
                  <th className="px-3 py-2 font-semibold">Scope</th>
                  <th className="px-3 py-2 font-semibold">Changed by</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-zinc-50">
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">
                      {new Date(h.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {h.assignment.user.name ?? h.assignment.user.email}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {h.type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {h.canView ? "view" : "—"}
                      {h.canUpdate ? " + update" : ""}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {h.changedBy.name ?? h.changedBy.email}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Grant dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign staff to site</DialogTitle>
            <DialogDescription>
              The user will see this site in the Android app according to
              the permissions you grant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-user">Staff member</Label>
              <Select
                value={userId ?? ""}
                onValueChange={(v) => setUserId(v || null)}
              >
                <SelectTrigger id="assign-user">
                  <SelectValue placeholder="Select a user…" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name ?? u.email} — {u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={canUpdate ? true : canView}
                  disabled={canUpdate}
                  onChange={(e) => setCanView(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                Can view site
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={canUpdate}
                  onChange={(e) => setCanUpdate(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                Can update progress
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={grant} disabled={!userId || pending}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <Dialog
        open={confirmRevoke !== null}
        onOpenChange={(o) => !o && setConfirmRevoke(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke site access</DialogTitle>
            <DialogDescription>
              {confirmRevoke?.user.name ?? confirmRevoke?.user.email} will
              immediately lose access to this site on the Android app. The
              assignment history is preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmRevoke && setActive(confirmRevoke, false)}
              disabled={pending}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createForward, getForwardRecords, acknowledgeForward } from "@/lib/actions/forward";
import { getReportingManager } from "@/lib/actions/staff";
import { Loader2, Send, History, CheckCircle, RotateCcw, Check, UserCog } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

export type ForwardEntityType = "TASK" | "ASSET" | "TADA_CLAIM" | "DUE_BILL" | "IN_OUT_REGISTER";

interface ForwardRecord {
  id: string;
  status: string;
  toStaffName: string | null;
  forwardedAt: string;
  remarks: string | null;
  acknowledgedAt: string | null;
}

interface ForwardDialogProps {
  entityType: ForwardEntityType;
  entityId: string;
  entityLabel: string;
  staff: { id: string; name: string }[];
  entityStaffId?: string;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  ACKNOWLEDGED: { label: "Acknowledged", className: "bg-blue-50 text-blue-700 border-blue-200" },
  ACTIONED: { label: "Actioned", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  RETURNED: { label: "Returned", className: "bg-red-50 text-red-700 border-red-200" },
};

export function ForwardDialog({
  entityType,
  entityId,
  entityLabel,
  staff,
  entityStaffId,
  onClose,
}: ForwardDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  const [toStaffId, setToStaffId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [history, setHistory] = useState<ForwardRecord[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [autoManager, setAutoManager] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (entityStaffId) {
      getReportingManager(entityStaffId).then((res) => {
        if (res.success && res.data) {
          const mgr = res.data as { id: string; name: string; designation: string | null };
          setAutoManager({ id: mgr.id, name: mgr.name });
          setToStaffId(mgr.id);
        }
      }).catch(() => {});
    }
  }, [entityStaffId]);

  async function handleForward(e: React.FormEvent) {
    e.preventDefault();
    if (!toStaffId) {
      setError("Please select a staff member to forward to");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await createForward({
        entityType,
        entityId,
        toStaffId,
        remarks: remarks.trim() || undefined,
      } as never);

      if (!res.success) {
        setError(res.error ?? "Failed to forward");
        toast.error(res.error ?? "Failed to forward");
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
      return;
    } finally {
      setSubmitting(false);
    }

    toast.success("Forwarded successfully");
    router.refresh();
    onClose();
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await getForwardRecords(entityType, entityId);
      if (res.success && res.data) {
        setHistory(res.data as ForwardRecord[]);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleAcknowledge(recordId: string, status: "ACKNOWLEDGED" | "ACTIONED" | "RETURNED") {
    try {
      const res = await acknowledgeForward({ id: recordId, status } as never);
      if (res.success) {
        toast.success("Forward record updated");
        router.refresh();
        await loadHistory();
      } else {
        toast.error(res.error ?? "Failed to update forward record");
      }
    } catch {
      toast.error("Failed to update forward record");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Forward / Handoff
          </DialogTitle>
          <DialogDescription>
            Forward <strong>{entityLabel}</strong> to a concerned person for action
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleForward} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Forward To</Label>
              {autoManager && toStaffId === autoManager.id && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600">
                  <UserCog className="h-3 w-3" />
                  Reporting Manager
                </span>
              )}
            </div>
            <Select value={toStaffId} onValueChange={(v) => setToStaffId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member">
                  {(value: string) =>
                    staff.find((s) => s.id === value)?.name ?? "Select staff member"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {autoManager?.id === s.id ? " (Reporting Manager)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {autoManager && (
              <p className="text-[10px] text-zinc-400">
                Auto-selected reporting manager. Change if needed.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Remarks / Instructions</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="What action is expected? Any instructions for the recipient…"
              rows={3}
            />
          </div>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Forwarding entity")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Forward
            </Button>
          </div>
        </form>

        <div className="border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={loadHistory}
            disabled={loadingHistory}
          >
            {loadingHistory ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <History className="mr-1.5 h-3.5 w-3.5" />
            )}
            {history ? "Refresh History" : "View Forwarding History"}
          </Button>

          {history && (
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-center text-xs text-zinc-400">No forwarding records yet</p>
              ) : (
                history.map((rec) => {
                  const cfg = statusConfig[rec.status] ?? statusConfig.PENDING;
                  return (
                    <div
                      key={rec.id}
                      className="rounded-md border p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          → {rec.toStaffName ?? "Unassigned"}
                        </span>
                        <Badge variant="outline" className={cfg.className}>
                          {cfg.label}
                        </Badge>
                      </div>
                      <div className="mt-1 text-zinc-500">
                        {new Date(rec.forwardedAt).toLocaleString("en-IN")}
                      </div>
                      {rec.remarks && (
                        <div className="mt-1 text-zinc-600">{rec.remarks}</div>
                      )}
                      {rec.acknowledgedAt && (
                        <div className="mt-0.5 text-zinc-400">
                          Acknowledged: {new Date(rec.acknowledgedAt).toLocaleString("en-IN")}
                        </div>
                      )}
                      {rec.status === "PENDING" && (
                        <div className="mt-2 flex gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleAcknowledge(rec.id, "ACKNOWLEDGED")}
                          >
                            <Check className="mr-1 h-3 w-3" />
                            Acknowledge
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleAcknowledge(rec.id, "ACTIONED")}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Actioned
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleAcknowledge(rec.id, "RETURNED")}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Return
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ForwardBadge({
  status,
  toStaffName,
}: {
  status?: string;
  toStaffName?: string | null;
}) {
  if (!status) return null;
  const cfg = statusConfig[status] ?? statusConfig.PENDING;
  return (
    <Badge variant="outline" className={`text-[10px] ${cfg.className}`}>
      {cfg.label}{toStaffName ? ` → ${toStaffName}` : ""}
    </Badge>
  );
}

"use client";

import { useMemo, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { upsertFundFlow } from "@/lib/actions/fund-flow";
import { FundFlowWithComputed } from "@/types/fund-flow";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface FundFlowFormProps {
  project: FundFlowWithComputed;
  onClose: () => void;
}

function toMoneyString(value: unknown): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

export function FundFlowForm({ project, onClose }: FundFlowFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    miscExp: toMoneyString(project.fundFlow?.miscExp),
    staffExp: toMoneyString(project.fundFlow?.staffExp),
    totalProjectCost: toMoneyString(
      project.fundFlow?.totalProjectCost ?? project.estimatedCost
    ),
    completedWorkAmt: toMoneyString(project.fundFlow?.completedWorkAmt),
    proposedDueBillAmount: toMoneyString(
      project.fundFlow?.proposedDueBillAmount
    ),
    feeReceived: toMoneyString(project.fundFlow?.feeReceived),
  });
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

  const remainingWorkAmt = useMemo(() => {
    const total = Number(form.totalProjectCost) || 0;
    const completed = Number(form.completedWorkAmt) || 0;
    return total - completed;
  }, [form.totalProjectCost, form.completedWorkAmt]);

  const remainingFee = useMemo(() => {
    const total = Number(project.totalFee) || 0;
    const received = Number(form.feeReceived) || 0;
    return total - received;
  }, [project.totalFee, form.feeReceived]);

  function updateField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        projectId: project.id,
        miscExp: Number(form.miscExp) || 0,
        staffExp: Number(form.staffExp) || 0,
        totalProjectCost: Number(form.totalProjectCost) || 0,
        completedWorkAmt: Number(form.completedWorkAmt) || 0,
        proposedDueBillAmount: Number(form.proposedDueBillAmount) || 0,
        feeReceived: Number(form.feeReceived) || 0,
      };

      const result = await upsertFundFlow(
        payload as unknown as Parameters<typeof upsertFundFlow>[0]
      );

      if (!result.success) {
        setError(result.error ?? "Failed to save fund flow.");
        toast.error(result.error ?? "Failed to save fund flow.");
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

    toast.success("Fund flow saved successfully");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit fund flow</DialogTitle>
          <DialogDescription>
            Update financial numbers for {project.name}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="miscExp">Misc exp (₹)</Label>
              <Input
                id="miscExp"
                type="number"
                step="0.01"
                value={form.miscExp}
                onChange={(e) => updateField("miscExp", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staffExp">Staff exp (₹)</Label>
              <Input
                id="staffExp"
                type="number"
                step="0.01"
                value={form.staffExp}
                onChange={(e) => updateField("staffExp", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="totalProjectCost">Total project cost (₹)</Label>
              <Input
                id="totalProjectCost"
                type="number"
                step="0.01"
                value={form.totalProjectCost}
                onChange={(e) => updateField("totalProjectCost", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="completedWorkAmt">Completed work (₹)</Label>
              <Input
                id="completedWorkAmt"
                type="number"
                step="0.01"
                value={form.completedWorkAmt}
                onChange={(e) => updateField("completedWorkAmt", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proposedDueBillAmount">Proposed / due (₹)</Label>
              <Input
                id="proposedDueBillAmount"
                type="number"
                step="0.01"
                value={form.proposedDueBillAmount}
                onChange={(e) => updateField("proposedDueBillAmount", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feeReceived">Fee received (₹)</Label>
              <Input
                id="feeReceived"
                type="number"
                step="0.01"
                value={form.feeReceived}
                onChange={(e) => updateField("feeReceived", e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Remaining work</p>
              <p className="font-mono font-medium">
                ₹{remainingWorkAmt.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Remaining fee</p>
              <p className="font-mono font-medium">
                ₹{remainingFee.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Editing fund flow")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Save fund flow
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
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
import { createAssetMovement } from "@/lib/actions/asset";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface AssetTransferDialogProps {
  asset: {
    id: string;
    itemCode: string;
    name: string;
    currentHolderId?: string | null;
    status: string;
  };
  staff: { id: string; name: string }[];
  onClose: () => void;
}

const MOVEMENT_TYPES = [
  { value: "ASSIGNED_TO_EMPLOYEE", label: "Given to Employee" },
  { value: "RETURNED_FROM_EMPLOYEE", label: "Returned from Employee" },
  { value: "GONE_FOR_REPAIR", label: "Gone for Repair" },
  { value: "RETURNED_FROM_REPAIR", label: "Returned from Repair" },
  { value: "TRASH", label: "Trash / Disposed" },
  { value: "NOT_WORKING", label: "Not Working" },
  { value: "TRANSFERRED", label: "Transfer to another Employee" },
];

export function AssetTransferDialog({
  asset,
  staff,
  onClose,
}: AssetTransferDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  const [movementType, setMovementType] = useState("");
  const [toStaffId, setToStaffId] = useState("");
  const [notes, setNotes] = useState("");

  const needsToStaff =
    movementType === "ASSIGNED_TO_EMPLOYEE" ||
    movementType === "TRANSFERRED";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!movementType) {
      setError("Please select a movement type");
      return;
    }
    if (needsToStaff && !toStaffId) {
      setError("Please select the employee to assign/transfer to");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await createAssetMovement({
        assetId: asset.id,
        movementType,
        toStaffId: toStaffId || undefined,
        notes: notes.trim() || undefined,
      } as never);

      if (!res.success) {
        setError(res.error ?? "Failed to record movement");
        toast.error(res.error ?? "Failed to record movement");
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

    toast.success("Asset movement recorded successfully");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Asset Movement / Transfer
          </DialogTitle>
          <DialogDescription>
            Record movement for <strong>{asset.itemCode}</strong> — {asset.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Movement Type</Label>
            <Select value={movementType} onValueChange={(v) => setMovementType(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select movement type" />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_TYPES.map((mt) => (
                  <SelectItem key={mt.value} value={mt.value}>
                    {mt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsToStaff && (
            <div className="space-y-1.5">
              <Label>Assign to (Employee)</Label>
              <Select value={toStaffId} onValueChange={(v) => setToStaffId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee">
                    {(value: string) =>
                      staff.find((s) => s.id === value)?.name ?? "Select employee"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes / Remarks</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for movement, condition notes, etc."
              rows={3}
            />
          </div>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Asset transfer/movement")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Record Movement
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

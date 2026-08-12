"use client";

import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { getAssetMovements } from "@/lib/actions/asset";

interface AssetMovementHistoryProps {
  assetId: string;
  assetName: string;
  onClose: () => void;
}

interface MovementRow {
  id: string;
  movementType: string;
  movementDate: string;
  notes: string | null;
  fromStaff: { id: string; name: string } | null;
  toStaff: { id: string; name: string } | null;
}

function formatDate(value: string): string {
  const d = new Date(value);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMovementType(type: string): string {
  return type.toLowerCase().replace(/_/g, " ");
}

const movementVariantMap: Record<string, string> = {
  ASSIGNED_TO_EMPLOYEE: "bg-blue-50 text-blue-700 border-blue-200",
  RETURNED_FROM_EMPLOYEE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  GONE_FOR_REPAIR: "bg-amber-50 text-amber-700 border-amber-200",
  RETURNED_FROM_REPAIR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  TRASH: "bg-zinc-100 text-zinc-700 border-zinc-200",
  NOT_WORKING: "bg-red-50 text-red-700 border-red-200",
  TRANSFERRED: "bg-purple-50 text-purple-700 border-purple-200",
};

export function AssetMovementHistory({
  assetId,
  assetName,
  onClose,
}: AssetMovementHistoryProps) {
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await getAssetMovements(assetId);
      if (!cancelled) {
        if (res.success && res.data) {
          setMovements(res.data as MovementRow[]);
        }
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Movement history — {assetName}</DialogTitle>
          <DialogDescription>
            All assignments, transfers, and status changes for this asset.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-zinc-500">No movements recorded yet</p>
            </div>
          ) : (
            <Table className="text-xs">
              <TableHeader className="sticky top-0 bg-white">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead className="whitespace-nowrap">Type</TableHead>
                  <TableHead className="whitespace-nowrap">From</TableHead>
                  <TableHead className="whitespace-nowrap">To</TableHead>
                  <TableHead className="whitespace-nowrap">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(m.movementDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={movementVariantMap[m.movementType] ?? ""}
                      >
                        {formatMovementType(m.movementType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {m.fromStaff?.name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {m.toStaff?.name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {m.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

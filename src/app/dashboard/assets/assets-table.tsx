"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { AssetStatus } from "@prisma/client";
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
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetFilterInput } from "@/lib/schemas/asset";
import { AssetWithComputed } from "@/types/assets";
import { AssetForm } from "./asset-form";
import { AssetTransferDialog } from "./asset-transfer-dialog";
import { AssetMovementHistory } from "./asset-movement-history";
import type { MasterData } from "@/lib/master-data";
import {
  ChevronLeft,
  ChevronRight,
  Box,
  Pencil,
  Plus,
  ArrowRightLeft,
  History,
  FileText,
} from "lucide-react";

interface AssetsTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: AssetFilterInput;
  masters?: MasterData;
  staff?: { id: string; name: string }[];
}

const statusVariantMap: Record<AssetStatus, string> = {
  [AssetStatus.AVAILABLE]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [AssetStatus.ASSIGNED]: "bg-blue-50 text-blue-700 border-blue-200",
  [AssetStatus.UNDER_MAINTENANCE]:
    "bg-amber-50 text-amber-700 border-amber-200",
  [AssetStatus.DISPOSED]: "bg-zinc-100 text-zinc-700 border-zinc-200",
  [AssetStatus.NOT_WORKING]: "bg-red-50 text-red-700 border-red-200",
};

function formatEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ");
}

function formatQuantity(
  value: Decimal | string | number | null | undefined
): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : Number(value);
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AssetsTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  filter,
  masters,
  staff,
}: AssetsTableProps) {
  const router = useRouter();
  const [selectedAsset, setSelectedAsset] = useState<AssetWithComputed | null>(
    null
  );
  const [createAssetOpen, setCreateAssetOpen] = useState(false);
  const [transferAsset, setTransferAsset] = useState<AssetWithComputed | null>(null);
  const [historyAsset, setHistoryAsset] = useState<AssetWithComputed | null>(null);

  if (rows.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Box className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No assets</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Add an asset to start tracking item codes, assignments, and
            warranty documents.
          </p>
        </CardContent>
      </Card>
    );
  }

  const typedRows = rows as AssetWithComputed[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (filter.category) params.set("category", filter.category);
    if (filter.status) params.set("status", filter.status);
    if (filter.yearOfPurchase)
      params.set("yearOfPurchase", String(filter.yearOfPurchase));
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">Assets</h2>
        <Button size="sm" onClick={() => setCreateAssetOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New asset
        </Button>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Item Code</TableHead>
                <TableHead className="whitespace-nowrap">Security Code</TableHead>
                <TableHead className="whitespace-nowrap">Name</TableHead>
                <TableHead className="whitespace-nowrap">Category</TableHead>
                <TableHead className="whitespace-nowrap">Make / Model</TableHead>
                <TableHead className="whitespace-nowrap">Year</TableHead>
                <TableHead className="whitespace-nowrap text-right">Qty</TableHead>
                <TableHead className="whitespace-nowrap text-right">Remaining</TableHead>
                <TableHead className="whitespace-nowrap">Assignee</TableHead>
                <TableHead className="whitespace-nowrap">Responsible</TableHead>
                <TableHead className="whitespace-nowrap">Current Holder</TableHead>
                <TableHead className="whitespace-nowrap">Bills & Warranty</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {row.itemCode}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-zinc-600">
                    {row.securityCode || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.category ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {[row.make, row.model].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.yearOfPurchase ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatQuantity(row.quantity)}
                  </TableCell>
                  <TableCell
                    className={`whitespace-nowrap text-right font-mono ${
                      row.remainingQuantity < 0 ? "text-red-600" : ""
                    }`}
                  >
                    {formatQuantity(row.remainingQuantity)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.assignee ? (
                      <span className="text-xs">
                        {formatEnum(row.assigneeType)}: {row.assignee}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.responsiblePerson ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.currentHolder?.name ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.billWarrantyPath ? (
                      <a
                        href={row.billWarrantyPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                        title="View scanned bill or warranty"
                      >
                        <FileText className="h-3.5 w-3.5 text-blue-600" />
                        <span>View doc</span>
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400">No doc</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className={statusVariantMap[row.status]}
                    >
                      {formatEnum(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setSelectedAsset(row)}
                        title="Edit asset"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setTransferAsset(row)}
                        title="Transfer / Movement"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setHistoryAsset(row)}
                        title="Movement history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                router.push(`/dashboard/assets${buildQueryString(page - 1)}`)
              }
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() =>
                router.push(`/dashboard/assets${buildQueryString(page + 1)}`)
              }
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedAsset && (
        <AssetForm
          asset={selectedAsset}
          mode="edit"
          masters={masters}
          staff={staff}
          onClose={() => setSelectedAsset(null)}
        />
      )}

      {transferAsset && staff && (
        <AssetTransferDialog
          asset={transferAsset}
          staff={staff}
          onClose={() => setTransferAsset(null)}
        />
      )}

      {historyAsset && (
        <AssetMovementHistory
          assetId={historyAsset.id}
          assetName={historyAsset.name}
          onClose={() => setHistoryAsset(null)}
        />
      )}

      {createAssetOpen && (
        <AssetForm mode="create" masters={masters} staff={staff} onClose={() => setCreateAssetOpen(false)} />
      )}
    </div>
  );
}

export function AssetsTableSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-0">
        <div className="space-y-2 p-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

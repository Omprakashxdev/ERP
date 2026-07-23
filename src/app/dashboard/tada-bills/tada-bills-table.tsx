"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Pencil, CheckCircle } from "lucide-react";
import { TadaClaimEditForm, TadaApprovalActions } from "./tada-bills-form";

interface TadaClaimRow {
  id: string;
  staffId: string;
  tourPurpose: string;
  fromDate: Date;
  toDate: Date;
  location: string;
  totalClaimAmount: unknown;
  status: string;
  advanceAmount: unknown;
  travelExpense: unknown;
  accommodationExp: unknown;
  foodExpense: unknown;
  localConveyance: unknown;
  otherExpense: unknown;
  staff: { id: string; name: string; designation: string | null };
  createdAt: Date;
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  SUBMITTED: "bg-blue-50 text-blue-700",
  MANAGER_APPROVED: "bg-emerald-50 text-emerald-700",
  MANAGER_REJECTED: "bg-red-50 text-red-700",
  ACCOUNTS_VERIFIED: "bg-emerald-50 text-emerald-700",
  ACCOUNTS_QUERY: "bg-amber-50 text-amber-700",
  FINANCE_APPROVED: "bg-emerald-50 text-emerald-700",
  PAID: "bg-green-100 text-green-800",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  MANAGER_APPROVED: "Manager Approved",
  MANAGER_REJECTED: "Rejected",
  ACCOUNTS_VERIFIED: "Accounts Verified",
  ACCOUNTS_QUERY: "Accounts Query",
  FINANCE_APPROVED: "Finance Approved",
  PAID: "Paid",
};

export function TadaClaimTable({
  claims,
  total,
  page,
  pageSize,
  staff,
  userRole,
}: {
  claims: TadaClaimRow[];
  total: number;
  page: number;
  pageSize: number;
  staff: { id: string; name: string }[];
  userRole: string;
}) {
  const [editClaim, setEditClaim] = useState<TadaClaimRow | null>(null);
  const [approvalClaim, setApprovalClaim] = useState<TadaClaimRow | null>(null);
  const totalPages = Math.ceil(total / pageSize);

  if (claims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm text-zinc-500">No TADA claims found.</p>
        <p className="mt-1 text-xs text-zinc-400">
          Create a new claim to get started.
        </p>
      </div>
    );
  }

  const canEdit = (status: string) => status === "DRAFT" || status === "MANAGER_REJECTED" || status === "ACCOUNTS_QUERY";
  const canApprove = (status: string) =>
    userRole === "ADMIN" &&
    (status === "SUBMITTED" || status === "MANAGER_APPROVED" ||
    status === "ACCOUNTS_VERIFIED" || status === "FINANCE_APPROVED");

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border">
        <div className="max-h-[60vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Employee</TableHead>
                <TableHead className="whitespace-nowrap">Tour Purpose</TableHead>
                <TableHead className="whitespace-nowrap">From</TableHead>
                <TableHead className="whitespace-nowrap">To</TableHead>
                <TableHead className="whitespace-nowrap">Location</TableHead>
                <TableHead className="whitespace-nowrap">Total ₹</TableHead>
                <TableHead className="whitespace-nowrap">Advance ₹</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {claim.staff.name}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {claim.tourPurpose}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-500">
                    {new Date(claim.fromDate).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-500">
                    {new Date(claim.toDate).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{claim.location}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {Number(claim.totalClaimAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-500">
                    {claim.advanceAmount ? Number(claim.advanceAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColors[claim.status] ?? "bg-zinc-100 text-zinc-600"}`}
                    >
                      {statusLabels[claim.status] ?? claim.status}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex gap-1">
                      {canEdit(claim.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditClaim(claim)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canApprove(claim.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setApprovalClaim(claim)}
                        >
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(page - 1));
                window.location.search = params.toString();
              }}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(page + 1));
                window.location.search = params.toString();
              }}
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {editClaim && (
        <TadaClaimEditForm
          claim={editClaim}
          staff={staff}
          onClose={() => setEditClaim(null)}
        />
      )}

      {approvalClaim && (
        <TadaApprovalActions
          claimId={approvalClaim.id}
          status={approvalClaim.status}
          onClose={() => setApprovalClaim(null)}
        />
      )}
    </div>
  );
}

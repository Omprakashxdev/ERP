"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ContractorFilterInput } from "@/lib/schemas/contractor";
import { ContractorWithComputed } from "@/types/contractor";
import { ContractorForm } from "./contractor-form";
import { BillCertificationDialog } from "./bill-certification-dialog";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
  HardHat,
  FileCheck,
} from "lucide-react";

interface ContractorsTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: ContractorFilterInput;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: Decimal | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : Number(value);
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ");
}

export function ContractorsTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  filter,
}: ContractorsTableProps) {
  const router = useRouter();
  const [selectedContractor, setSelectedContractor] =
    useState<ContractorWithComputed | null>(null);
  const [certContractor, setCertContractor] =
    useState<ContractorWithComputed | null>(null);
  const [createContractorOpen, setCreateContractorOpen] = useState(false);

  if (rows.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No contractor records</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Add a contractor to start tracking work orders, drawings, and billing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const typedRows = rows as ContractorWithComputed[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">Contractor records</h2>
        <Button size="sm" onClick={() => setCreateContractorOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New contractor
        </Button>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Name</TableHead>
                <TableHead className="whitespace-nowrap">Contact Person</TableHead>
                <TableHead className="whitespace-nowrap">Phone</TableHead>
                <TableHead className="whitespace-nowrap">Email</TableHead>
                <TableHead className="whitespace-nowrap">Tender ID</TableHead>
                <TableHead className="whitespace-nowrap">Work Name</TableHead>
                <TableHead className="whitespace-nowrap">Type</TableHead>
                <TableHead className="whitespace-nowrap">Service</TableHead>
                <TableHead className="whitespace-nowrap text-right">Contract Amount</TableHead>
                <TableHead className="whitespace-nowrap">Agreement</TableHead>
                <TableHead className="whitespace-nowrap">Work Order</TableHead>
                <TableHead className="whitespace-nowrap text-right">Projects</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {row.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.contactPerson ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.phone ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.tenderId ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {row.workName ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatEnum(row.workType)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatEnum(row.serviceType)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {formatMoney(row.contractAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.agreementDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.workOrderDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <HardHat className="h-3.5 w-3.5 text-zinc-400" />
                      {row.projectCount ?? row._count.projects}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setSelectedContractor(row)}
                        title="Edit contractor"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setCertContractor(row)}
                        title="Bill certification"
                      >
                        <FileCheck className="h-3.5 w-3.5 text-blue-600" />
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
                router.push(
                  `/dashboard/contractors${buildQueryString(page - 1)}`
                )
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
                router.push(
                  `/dashboard/contractors${buildQueryString(page + 1)}`
                )
              }
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedContractor && (
        <ContractorForm
          contractor={selectedContractor}
          mode="edit"
          onClose={() => setSelectedContractor(null)}
        />
      )}

      {createContractorOpen && (
        <ContractorForm
          mode="create"
          onClose={() => setCreateContractorOpen(false)}
        />
      )}

      {certContractor && (
        <BillCertificationDialog
          contractor={certContractor as unknown as Parameters<typeof BillCertificationDialog>[0]["contractor"]}
          onClose={() => setCertContractor(null)}
        />
      )}
    </div>
  );
}

export function ContractorsTableSkeleton() {
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

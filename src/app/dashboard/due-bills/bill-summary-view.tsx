"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Building2 } from "lucide-react";

interface BillRow {
  id: string;
  scheme: string;
  grossAmount: string;
  sgst: string;
  cgst: string;
  billAmount: string;
  receivedAmount: string;
  chequeAmount: string;
  sd: string;
  itTds: string;
  billDate: string | null;
  receiveDate: string | null;
  status: string;
  remarks: string | null;
}

interface ClientGroup {
  clientId: string;
  clientName: string;
  bills: BillRow[];
  totals: {
    grossAmount: string;
    billAmount: string;
    receivedAmount: string;
    chequeAmount: string;
    sd: string;
    itTds: string;
  };
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PARTIAL: "bg-blue-50 text-blue-700",
  RECEIVED: "bg-emerald-50 text-emerald-700",
};

function fmt(value: string | number | null | undefined): string {
  if (!value) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN");
}

export function BillSummaryView({ groups }: { groups: ClientGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(clientId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <Building2 className="h-10 w-10 text-zinc-300" />
        <p className="mt-3 text-sm text-zinc-500">No bills found.</p>
      </div>
    );
  }

  const grandTotal = groups.reduce(
    (acc, g) => {
      acc.grossAmount += parseFloat(g.totals.grossAmount || "0");
      acc.billAmount += parseFloat(g.totals.billAmount || "0");
      acc.receivedAmount += parseFloat(g.totals.receivedAmount || "0");
      acc.chequeAmount += parseFloat(g.totals.chequeAmount || "0");
      acc.sd += parseFloat(g.totals.sd || "0");
      acc.itTds += parseFloat(g.totals.itTds || "0");
      return acc;
    },
    { grossAmount: 0, billAmount: 0, receivedAmount: 0, chequeAmount: 0, sd: 0, itTds: 0 }
  );

  return (
    <div className="space-y-3">
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="whitespace-nowrap">Client</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Gross Amt</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Bill Amt</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Received</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Cheque Amt</TableHead>
                  <TableHead className="whitespace-nowrap text-right">SD</TableHead>
                  <TableHead className="whitespace-nowrap text-right">IT/TDS</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Bills</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => {
                  const isOpen = expanded.has(group.clientId);
                  return (
                    <>
                      <TableRow
                        key={group.clientId}
                        className="cursor-pointer hover:bg-zinc-50 font-medium"
                        onClick={() => toggle(group.clientId)}
                      >
                        <TableCell className="w-8">
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{group.clientName}</TableCell>
                        <TableCell className="text-right">{fmt(group.totals.grossAmount)}</TableCell>
                        <TableCell className="text-right">{fmt(group.totals.billAmount)}</TableCell>
                        <TableCell className="text-right">{fmt(group.totals.receivedAmount)}</TableCell>
                        <TableCell className="text-right">{fmt(group.totals.chequeAmount)}</TableCell>
                        <TableCell className="text-right">{fmt(group.totals.sd)}</TableCell>
                        <TableCell className="text-right">{fmt(group.totals.itTds)}</TableCell>
                        <TableCell className="text-center">{group.bills.length}</TableCell>
                      </TableRow>
                      {isOpen &&
                        group.bills.map((bill) => (
                          <TableRow key={bill.id} className="bg-zinc-50/50">
                            <TableCell></TableCell>
                            <TableCell className="pl-8 text-zinc-600">
                              {bill.scheme}
                            </TableCell>
                            <TableCell className="text-right text-zinc-600">{fmt(bill.grossAmount)}</TableCell>
                            <TableCell className="text-right text-zinc-600">{fmt(bill.billAmount)}</TableCell>
                            <TableCell className="text-right text-zinc-600">{fmt(bill.receivedAmount)}</TableCell>
                            <TableCell className="text-right text-zinc-600">{fmt(bill.chequeAmount)}</TableCell>
                            <TableCell className="text-right text-zinc-600">{fmt(bill.sd)}</TableCell>
                            <TableCell className="text-right text-zinc-600">{fmt(bill.itTds)}</TableCell>
                            <TableCell className="text-center">
                              <span
                                className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColors[bill.status] ?? "bg-zinc-100 text-zinc-600"}`}
                              >
                                {bill.status}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      {isOpen && (
                        <TableRow className="bg-zinc-100/50 font-medium border-t">
                          <TableCell></TableCell>
                          <TableCell className="pl-8 text-zinc-500">Subtotal</TableCell>
                          <TableCell className="text-right">{fmt(group.totals.grossAmount)}</TableCell>
                          <TableCell className="text-right">{fmt(group.totals.billAmount)}</TableCell>
                          <TableCell className="text-right">{fmt(group.totals.receivedAmount)}</TableCell>
                          <TableCell className="text-right">{fmt(group.totals.chequeAmount)}</TableCell>
                          <TableCell className="text-right">{fmt(group.totals.sd)}</TableCell>
                          <TableCell className="text-right">{fmt(group.totals.itTds)}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
                <TableRow className="border-t-2 font-bold bg-zinc-50">
                  <TableCell></TableCell>
                  <TableCell>GRAND TOTAL</TableCell>
                  <TableCell className="text-right">{fmt(grandTotal.grossAmount)}</TableCell>
                  <TableCell className="text-right">{fmt(grandTotal.billAmount)}</TableCell>
                  <TableCell className="text-right">{fmt(grandTotal.receivedAmount)}</TableCell>
                  <TableCell className="text-right">{fmt(grandTotal.chequeAmount)}</TableCell>
                  <TableCell className="text-right">{fmt(grandTotal.sd)}</TableCell>
                  <TableCell className="text-right">{fmt(grandTotal.itTds)}</TableCell>
                  <TableCell className="text-center">
                    {groups.reduce((s, g) => s + g.bills.length, 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

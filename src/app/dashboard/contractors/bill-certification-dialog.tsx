"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface BillCertificationDialogProps {
  contractor: {
    id: string;
    name: string;
    contactPerson?: string | null;
    phone?: string | null;
    address?: string | null;
    contractAmount?: unknown;
    scheduleBAmount?: unknown;
    workName?: string | null;
    workType?: string | null;
    serviceType?: string | null;
    agreementDate?: Date | string | null;
    workOrderDate?: Date | string | null;
    raBillDetails?: string | null;
    finalProgressAmount?: unknown;
    finalProgressProjectExpense?: unknown;
  };
  onClose: () => void;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoney(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (isNaN(num)) return "—";
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function BillCertificationDialog({ contractor, onClose }: BillCertificationDialogProps) {
  const todayStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const contractAmt = Number(contractor.contractAmount ?? 0);
  const scheduleBAmt = Number(contractor.scheduleBAmount ?? 0);
  const finalProgressAmt = Number(contractor.finalProgressAmount ?? 0);
  const projectExpense = Number(contractor.finalProgressProjectExpense ?? 0);
  const balance = contractAmt - finalProgressAmt;

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto print:max-w-none print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>Contractor Bill Certification</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-zinc-200 bg-white p-8 print:border-0 print:p-0">
          <div className="mb-8 text-center">
            <h1 className="text-xl font-bold uppercase tracking-wide">SAEC Consultancy</h1>
            <p className="text-xs text-zinc-500">Consulting Engineers & Project Managers</p>
            <h2 className="mt-4 text-base font-semibold underline">Contractor Bill Certification</h2>
          </div>

          <div className="mb-6 flex justify-between text-sm">
            <div>
              <p className="font-medium">Cert No: SAEC/CERT/{new Date().getFullYear()}/{contractor.id.slice(-6).toUpperCase()}</p>
              <p className="text-zinc-500">Date: {todayStr}</p>
            </div>
            <div className="text-right">
              <p className="font-medium">To,</p>
              <p className="font-semibold">{contractor.name}</p>
              {contractor.address && <p className="text-xs text-zinc-500">{contractor.address}</p>}
              {contractor.phone && <p className="text-xs text-zinc-500">Ph: {contractor.phone}</p>}
            </div>
          </div>

          <div className="mb-6">
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4 font-medium bg-zinc-50 w-1/3">Work Name</td>
                  <td className="py-2">{contractor.workName ?? "—"}</td>
                </tr>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4 font-medium bg-zinc-50">Work Type</td>
                  <td className="py-2">{contractor.workType?.toLowerCase().replace(/_/g, " ") ?? "—"}</td>
                </tr>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4 font-medium bg-zinc-50">Service Type</td>
                  <td className="py-2">{contractor.serviceType?.toLowerCase().replace(/_/g, " ") ?? "—"}</td>
                </tr>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4 font-medium bg-zinc-50">Agreement Date</td>
                  <td className="py-2">{formatDate(contractor.agreementDate)}</td>
                </tr>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4 font-medium bg-zinc-50">Work Order Date</td>
                  <td className="py-2">{formatDate(contractor.workOrderDate)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold underline">Bill Summary</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-zinc-300">
                  <th className="py-2 pr-4 text-left">Description</th>
                  <th className="py-2 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4">Total Contract Amount (Schedule A)</td>
                  <td className="py-2 text-right font-mono">{formatMoney(contractAmt)}</td>
                </tr>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4">Schedule B Amount</td>
                  <td className="py-2 text-right font-mono">{formatMoney(scheduleBAmt)}</td>
                </tr>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4">Final Progress Amount (Work Done)</td>
                  <td className="py-2 text-right font-mono">{formatMoney(finalProgressAmt)}</td>
                </tr>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4">Project Expense Incurred</td>
                  <td className="py-2 text-right font-mono">{formatMoney(projectExpense)}</td>
                </tr>
                <tr className="border-b-2 border-zinc-300 bg-amber-50">
                  <td className="py-2 pr-4 font-bold">Balance Work Value</td>
                  <td className="py-2 text-right font-mono font-bold">{formatMoney(balance)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {contractor.raBillDetails && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold underline">RA Bill Details</h3>
              <p className="text-xs text-zinc-600 whitespace-pre-wrap">{contractor.raBillDetails}</p>
            </div>
          )}

          <div className="mt-8 text-sm">
            <p className="mb-4">
              This is to certify that the bill submitted by <strong>{contractor.name}</strong> for the work
              mentioned above has been verified and found to be in order. The work has been executed
              satisfactorily as per the terms and conditions of the agreement.
            </p>
            <p className="mb-8">
              The payment of <strong>{formatMoney(finalProgressAmt)}</strong> may be released to the contractor
              as per the payment terms agreed upon.
            </p>

            <div className="flex justify-between">
              <div>
                <p className="text-xs text-zinc-500">Prepared By:</p>
                <p className="mt-12 border-t border-zinc-300 pt-1 text-xs">Project Engineer</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500">Certified By:</p>
                <p className="mt-12 border-t border-zinc-300 pt-1 text-xs">Authorized Signatory</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="print:hidden">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";

interface InvoiceData {
  id: string;
  scheme: string;
  grossAmount: number;
  sgst: number;
  cgst: number;
  billAmount: number;
  chequeAmount: number;
  sd: number;
  itTds: number;
  receivedAmount: number;
  billDate: Date | string | null;
  receiveDate: Date | string | null;
  remarks: string | null;
  project: {
    name: string;
    address: string | null;
    client: {
      name: string;
      address: string | null;
    };
    region: {
      name: string;
    };
  };
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0.00";
  const num = Number(value);
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function generateInvoiceNumber(bill: InvoiceData): string {
  const date = bill.billDate ? new Date(bill.billDate) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const shortId = bill.id.slice(-6).toUpperCase();
  return `INV-${year}${month}-${shortId}`;
}

export function InvoiceDialog({
  bill,
  onClose,
}: {
  bill: InvoiceData;
  onClose: () => void;
}) {
  const [printing, setPrinting] = useState(false);

  const invoiceNo = generateInvoiceNumber(bill);
  const pendingAmount = Number(bill.billAmount) - Number(bill.receivedAmount);

  function handlePrint() {
    setPrinting(true);

    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) {
      alert("Please allow pop-ups to generate the invoice PDF.");
      setPrinting(false);
      return;
    }

    const invoiceHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${invoiceNo}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; padding: 40px; font-size: 13px; }
  .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #1a1a1a; padding-bottom: 20px; }
  .company-name { font-size: 24px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.5px; }
  .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
  .invoice-meta { text-align: right; }
  .invoice-title { font-size: 28px; font-weight: 300; color: #666; text-transform: uppercase; letter-spacing: 2px; }
  .invoice-no { font-size: 14px; font-weight: 600; margin-top: 8px; }
  .invoice-date { font-size: 12px; color: #666; margin-top: 4px; }
  .bill-to { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .bill-to-section { flex: 1; }
  .bill-to-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; }
  .bill-to-name { font-size: 15px; font-weight: 600; }
  .bill-to-addr { font-size: 12px; color: #666; margin-top: 4px; }
  .project-info { flex: 1; text-align: right; }
  .project-name { font-size: 15px; font-weight: 600; }
  .project-addr { font-size: 12px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: #f5f5f5; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #ddd; }
  thead th.right { text-align: right; }
  tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
  tbody td.right { text-align: right; font-family: 'Courier New', monospace; }
  tfoot td { padding: 10px 12px; font-size: 14px; font-weight: 600; border-top: 2px solid #1a1a1a; }
  tfoot td.right { text-align: right; font-family: 'Courier New', monospace; }
  .summary-box { display: flex; gap: 20px; margin-bottom: 30px; }
  .summary-card { flex: 1; padding: 15px; border: 1px solid #ddd; border-radius: 6px; }
  .summary-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; }
  .summary-value { font-size: 18px; font-weight: 700; margin-top: 4px; font-family: 'Courier New', monospace; }
  .summary-value.pending { color: #c0392b; }
  .summary-value.received { color: #27ae60; }
  .remarks { margin-top: 20px; padding: 12px; background: #f9f9f9; border-radius: 4px; font-size: 12px; color: #666; }
  .remarks-label { font-weight: 600; color: #333; margin-bottom: 4px; }
  .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 11px; color: #999; }
  .signature-area { text-align: right; margin-top: 40px; }
  .signature-line { border-top: 1px solid #333; width: 200px; display: inline-block; padding-top: 6px; font-size: 11px; color: #666; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="invoice-header">
    <div>
      <div class="company-name">SAEC</div>
      <div class="company-sub">Consultancy &amp; Engineering Services</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">Invoice</div>
      <div class="invoice-no">${invoiceNo}</div>
      <div class="invoice-date">Bill Date: ${formatDate(bill.billDate)}</div>
    </div>
  </div>
  <div class="bill-to">
    <div class="bill-to-section">
      <div class="bill-to-label">Bill To</div>
      <div class="bill-to-name">${bill.project.client.name}</div>
      <div class="bill-to-addr">${bill.project.client.address ?? ""}</div>
    </div>
    <div class="project-info">
      <div class="bill-to-label">Project</div>
      <div class="project-name">${bill.project.name}</div>
      <div class="project-addr">${bill.project.address ?? ""}</div>
      <div class="project-addr" style="margin-top:6px;">Region: ${bill.project.region.name}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Description</th><th class="right">Amount (Rs.)</th></tr>
    </thead>
    <tbody>
      <tr><td>Consultancy Fee - Scheme: ${bill.scheme}</td><td class="right">${formatMoney(bill.grossAmount)}</td></tr>
      <tr><td>SGST (9%)</td><td class="right">${formatMoney(bill.sgst)}</td></tr>
      <tr><td>CGST (9%)</td><td class="right">${formatMoney(bill.cgst)}</td></tr>
    </tbody>
    <tfoot>
      <tr><td>Total Bill Amount</td><td class="right">Rs. ${formatMoney(bill.billAmount)}</td></tr>
    </tfoot>
  </table>
  <div class="summary-box">
    <div class="summary-card"><div class="summary-label">Bill Amount</div><div class="summary-value">Rs. ${formatMoney(bill.billAmount)}</div></div>
    <div class="summary-card"><div class="summary-label">Received</div><div class="summary-value received">Rs. ${formatMoney(bill.receivedAmount)}</div></div>
    <div class="summary-card"><div class="summary-label">Pending</div><div class="summary-value pending">Rs. ${formatMoney(pendingAmount)}</div></div>
  </div>
  <table>
    <thead><tr><th>Payment Details</th><th class="right">Amount (Rs.)</th></tr></thead>
    <tbody>
      <tr><td>Cheque Amount</td><td class="right">${formatMoney(bill.chequeAmount)}</td></tr>
      <tr><td>Security Deposit (SD)</td><td class="right">${formatMoney(bill.sd)}</td></tr>
      <tr><td>IT / TDS</td><td class="right">${formatMoney(bill.itTds)}</td></tr>
      <tr><td><strong>Total Received</strong></td><td class="right"><strong>${formatMoney(bill.receivedAmount)}</strong></td></tr>
    </tbody>
  </table>
  ${bill.receiveDate ? `<p style="margin-top:15px;font-size:12px;color:#666;">Received Date: <strong>${formatDate(bill.receiveDate)}</strong></p>` : ""}
  ${bill.remarks ? `<div class="remarks"><div class="remarks-label">Remarks</div>${bill.remarks}</div>` : ""}
  <div class="signature-area"><div class="signature-line">Authorised Signatory</div></div>
  <div class="footer"><div>This is a computer-generated invoice.</div><div>Generated on ${new Date().toLocaleDateString("en-IN")}</div></div>
  <div class="no-print" style="text-align:center;margin-top:30px;">
    <button onclick="window.print()" style="padding:10px 30px;font-size:14px;cursor:pointer;background:#1a1a1a;color:#fff;border:none;border-radius:4px;">Print / Save as PDF</button>
  </div>
</body>
</html>`;

    printWindow.document.write(invoiceHtml);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setPrinting(false);
    }, 500);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invoice Preview</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Invoice No.</span>
              <span className="font-mono font-medium">{invoiceNo}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Client</span>
              <span className="font-medium">{bill.project.client.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Project</span>
              <span className="font-medium text-right max-w-[200px] truncate">{bill.project.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Scheme</span>
              <span className="font-medium">{bill.scheme}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Bill Date</span>
              <span className="font-medium">{formatDate(bill.billDate)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm">
              <span className="text-zinc-500">Bill Amount</span>
              <span className="font-mono font-bold">Rs.{formatMoney(bill.billAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Received</span>
              <span className="font-mono text-emerald-600">Rs.{formatMoney(bill.receivedAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Pending</span>
              <span className="font-mono text-red-600">Rs.{formatMoney(pendingAmount)}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" onClick={handlePrint} disabled={printing}>
              {printing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Printer className="mr-1.5 h-3.5 w-3.5" />}
              Generate PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

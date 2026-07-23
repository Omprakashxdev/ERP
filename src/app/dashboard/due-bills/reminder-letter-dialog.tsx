"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Mail, CheckCircle2 } from "lucide-react";
import { generateReminderLetter } from "@/lib/actions/due-bill-reminder";

interface ReminderLetterDialogProps {
  bill: {
    id: string;
    scheme: string;
    billDate: Date | string | null;
    billAmount: unknown;
    receivedAmount: unknown;
    project: {
      name: string;
      client: {
        name: string;
        address?: string | null;
        phone?: string | null;
        email?: string | null;
      };
      region: { name: string };
    };
  };
  onClose: () => void;
}

export function ReminderLetterDialog({ bill, onClose }: ReminderLetterDialogProps) {
  const [loading, setLoading] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billDateStr = bill.billDate
    ? new Date(bill.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  const todayStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const billAmt = Number(bill.billAmount);
  const receivedAmt = Number(bill.receivedAmount);
  const pendingAmt = billAmt - receivedAmt;

  const daysPending = bill.billDate
    ? Math.floor((Date.now() - new Date(bill.billDate).getTime()) / 86400000)
    : 0;
  const monthsPending = Math.floor(daysPending / 30);

  async function handleCreateTask() {
    setLoading(true);
    setError(null);
    const res = await generateReminderLetter({ billId: bill.id });
    setLoading(false);
    if (res.success) {
      setTaskCreated(true);
    } else {
      setError(res.error ?? "Failed to create reminder task");
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto print:max-w-none print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>Due Bill Reminder Letter</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-zinc-200 bg-white p-8 print:border-0 print:p-0">
          <div className="mb-8 text-center">
            <h1 className="text-xl font-bold uppercase tracking-wide">SAEC Consultancy</h1>
            <p className="text-xs text-zinc-500">Consulting Engineers & Project Managers</p>
          </div>

          <div className="mb-6 flex justify-between text-sm">
            <div>
              <p className="font-medium">Ref: SAEC/REM/{new Date().getFullYear()}/{bill.id.slice(-6).toUpperCase()}</p>
              <p className="text-zinc-500">Date: {todayStr}</p>
            </div>
            <div className="text-right">
              <p className="font-medium">To,</p>
              <p>{bill.project.client.name}</p>
              {bill.project.client.address && (
                <p className="text-xs text-zinc-500">{bill.project.client.address}</p>
              )}
            </div>
          </div>

          <div className="mb-4">
            <p className="font-semibold underline">Subject: Reminder for Pending Payment of Consultancy Bill</p>
          </div>

          <div className="space-y-3 text-sm leading-relaxed">
            <p>Dear Sir/Madam,</p>

            <p>
              We would like to bring to your kind attention that our consultancy bill for the project
              <strong> &ldquo;{bill.project.name}&rdquo;</strong> under scheme
              <strong> &ldquo;{bill.scheme}&rdquo;</strong> was submitted on
              <strong> {billDateStr}</strong>.
            </p>

            <p>
              As on date, the bill has been pending for <strong>{monthsPending} months ({daysPending} days)</strong>.
              The details of the bill are as follows:
            </p>

            <table className="my-4 w-full border-collapse text-sm">
              <tbody>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4 font-medium">Bill Amount</td>
                  <td className="py-2 text-right">₹{billAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr className="border-b border-zinc-200">
                  <td className="py-2 pr-4 font-medium">Received Amount</td>
                  <td className="py-2 text-right">₹{receivedAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr className="border-b border-zinc-200 bg-amber-50">
                  <td className="py-2 pr-4 font-medium">Pending Amount</td>
                  <td className="py-2 text-right font-bold">₹{pendingAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>

            <p>
              We request you to kindly arrange for the payment of the pending amount at the earliest.
              This is our <strong>{monthsPending >= 6 ? "second" : "first"}</strong> reminder.
              We have been following up regularly and would appreciate your prompt attention to this matter.
            </p>

            <p>
              Kindly process the payment within <strong>15 days</strong> from the date of this letter.
              If the payment has already been made, please disregard this reminder and share the payment details with us.
            </p>

            <p>Thanking you in anticipation.</p>

            <div className="mt-8 text-right">
              <p>Yours faithfully,</p>
              <p className="mt-8 font-medium">For SAEC Consultancy</p>
              <p className="text-xs text-zinc-500">Authorized Signatory</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {taskCreated && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Reminder task created and assigned to admin manager for follow-up.
          </div>
        )}

        <DialogFooter className="print:hidden">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print
          </Button>
          {!taskCreated && (
            <Button size="sm" onClick={handleCreateTask} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create Follow-up Task
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

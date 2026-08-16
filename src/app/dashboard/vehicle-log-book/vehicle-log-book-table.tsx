"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import {
  VehicleStatus,
  JourneyApprovalStatus,
} from "@prisma/client";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  VehicleFilterInput,
  JourneyLogFilterInput,
} from "@/lib/schemas/vehicle-log-book";
import { VehicleWithComputed, JourneyLogWithComputed } from "@/types/vehicle-log-book";
import { VehicleForm } from "./vehicle-form";
import { JourneyLogForm } from "./journey-log-form";
import { withBasePath } from "@/lib/base-path";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Route,
  Car,
  Eye,
  Download,
  FileCheck,
  FileX,
  FileText,
  Calendar,
  Clock,
  MapPin,
  Gauge,
  Receipt,
  User,
  Fuel,
  Wrench,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";

interface VehicleLogBookTableProps {
  vehicles: unknown[];
  journeyLogs: unknown[];
  activeTab: "vehicles" | "journeys";
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  vehicleFilter: VehicleFilterInput;
  journeyLogFilter: JourneyLogFilterInput;
  staff: { id: string; name: string }[];
  cities?: { id: string; name: string }[];
}

const vehicleStatusVariantMap: Record<VehicleStatus, string> = {
  [VehicleStatus.ACTIVE]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [VehicleStatus.INACTIVE]: "bg-zinc-100 text-zinc-700 border-zinc-200",
  [VehicleStatus.SOLD]: "bg-blue-50 text-blue-700 border-blue-200",
};

const approvalVariantMap: Record<JourneyApprovalStatus, string> = {
  [JourneyApprovalStatus.PENDING]:
    "bg-amber-50 text-amber-700 border-amber-200",
  [JourneyApprovalStatus.APPROVED]:
    "bg-emerald-50 text-emerald-700 border-emerald-200",
  [JourneyApprovalStatus.REJECTED]: "bg-red-50 text-red-700 border-red-200",
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(
  value: Decimal | string | number | null | undefined
): string {
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

/**
 * Eye Icon View Modal for Journey Log (Route, Timings, A/c Financials & All Uploaded Bills/Photos)
 */
function JourneyLogViewDialog({
  journey,
  onClose,
  onEdit,
}: {
  journey: JourneyLogWithComputed;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [activeTab, setActiveTab] = useState("overview");

  // All 9 standard uploaded documents & photos + any extra photos
  const documentsList = [
    {
      label: "Start KM Odometer Photo",
      path: journey.startKmPhotoPath,
      category: "KM Reading",
      icon: Gauge,
    },
    {
      label: "End KM Odometer Photo",
      path: journey.endKmPhotoPath,
      category: "KM Reading",
      icon: Gauge,
    },
    {
      label: "Fuel Bill",
      path: journey.fuelBillPath,
      category: "Fuel Expense",
      icon: Receipt,
    },
    {
      label: "Fuel Odometer Photo",
      path: (journey as any).fuelOdometerPhotoPath,
      category: "Fuel Expense",
      icon: Gauge,
    },
    {
      label: "Service Bill",
      path: journey.serviceBillPath,
      category: "Service",
      icon: Receipt,
    },
    {
      label: "Service Odometer Photo",
      path: (journey as any).serviceOdometerPhotoPath,
      category: "Service",
      icon: Gauge,
    },
    {
      label: "Maintenance Bill",
      path: journey.maintenanceBillPath,
      category: "Maintenance",
      icon: Receipt,
    },
    {
      label: "Maintenance Odometer Photo",
      path: (journey as any).maintenanceOdometerPhotoPath,
      category: "Maintenance",
      icon: Gauge,
    },
    {
      label: "Tax / Toll Receipt",
      path: journey.taxReceiptPath,
      category: "Tax & Toll",
      icon: Receipt,
    },
  ];

  const uploadedCount = documentsList.filter((d) => Boolean(d.path)).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                <Route className="h-5 w-5 text-teal-600" />
                Journey Log Dossier
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 mt-1 flex items-center gap-2">
                <span>{formatDate(journey.journeyDate)}</span>
                <span>•</span>
                <span className="font-medium text-zinc-800">{journey.vehicle.registrationNumber}</span>
                <span>•</span>
                <span className="text-teal-700 font-medium">{journey.fromLocation} → {journey.toLocation}</span>
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className={`text-xs px-2.5 py-0.5 ${approvalVariantMap[journey.approvalStatus]}`}
            >
              {formatEnum(journey.approvalStatus)}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 w-full mb-4">
              <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs">
                <Route className="h-3.5 w-3.5" />
                Trip & Route
              </TabsTrigger>
              <TabsTrigger value="accounts" className="flex items-center gap-1.5 text-xs">
                <Wallet className="h-3.5 w-3.5" />
                Financials (A/c.)
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Bills & Photos ({uploadedCount}/9)
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Trip & Route Overview */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-zinc-50/80 p-4 rounded-lg border border-zinc-100">
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Vehicle</span>
                  <span className="text-zinc-900 font-semibold">
                    {journey.vehicle.registrationNumber} {journey.vehicle.make ? `(${journey.vehicle.make} ${journey.vehicle.model ?? ""})` : ""}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Journey Date</span>
                  <span className="text-zinc-900 font-medium">{formatDate(journey.journeyDate)}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Time In</span>
                  <span className="text-zinc-900">{(journey as any).timeIn || "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Time Out</span>
                  <span className="text-zinc-900">{(journey as any).timeOut || "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Start Location</span>
                  <span className="text-zinc-900">{journey.fromLocation || "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">End Location</span>
                  <span className="text-zinc-900">{journey.toLocation || "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Start KM</span>
                  <span className="text-zinc-900 font-mono font-medium">{Number(journey.startKm).toFixed(2)} KM</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">End KM</span>
                  <span className="text-zinc-900 font-mono font-medium">{Number(journey.endKm).toFixed(2)} KM</span>
                </div>
                <div className="sm:col-span-2 bg-teal-50/70 p-2.5 rounded border border-teal-100 flex items-center justify-between">
                  <span className="text-xs text-teal-800 font-medium">Total Travel Run:</span>
                  <span className="text-base font-bold text-teal-900 font-mono">{Number(journey.totalKm).toFixed(2)} KM</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Person(s) Travelling</span>
                  <span className="text-zinc-900">{journey.personsTravelling || "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Driver Name</span>
                  <span className="text-zinc-900">{journey.driverName || "—"}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs text-zinc-500 font-medium block">Driver Daily Allowance Details</span>
                  <span className="text-zinc-900">{(journey as any).driverAllowanceDetails || "—"}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs text-zinc-500 font-medium block">Purpose of Travel</span>
                  <span className="text-zinc-900">{journey.purpose || "—"}</span>
                </div>
                {journey.remarks && (
                  <div className="sm:col-span-2">
                    <span className="text-xs text-zinc-500 font-medium block">Remarks (if any)</span>
                    <span className="text-zinc-900 whitespace-pre-line">{journey.remarks}</span>
                  </div>
                )}
                {journey.approvedBy && (
                  <div className="sm:col-span-2 pt-2 border-t border-zinc-200">
                    <span className="text-xs text-zinc-500 font-medium block">Approved By Authority</span>
                    <span className="text-zinc-900 font-medium">
                      {journey.approvedBy.name} {journey.approvedBy.designation ? `(${journey.approvedBy.designation})` : ""}
                    </span>
                  </div>
                )}
                {journey.rejectedReason && (
                  <div className="sm:col-span-2 bg-red-50 p-2 rounded border border-red-200 text-red-800 text-xs">
                    <span className="font-semibold">Rejection Reason:</span> {journey.rejectedReason}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 2: Financial Accounts Breakdown */}
            <TabsContent value="accounts" className="space-y-4 mt-0">
              <div className="bg-zinc-50/80 p-4 rounded-lg border border-zinc-100 space-y-4">
                <div className="flex items-center justify-between p-3 bg-white rounded-md border border-zinc-200 shadow-sm">
                  <span className="text-sm font-semibold text-zinc-800">Total Trip Expenses (A/c.)</span>
                  <span className="text-lg font-bold text-teal-700">{formatMoney(journey.totalExpenses)}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {/* Fuel */}
                  <div className="p-3 bg-white rounded border border-zinc-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                        <Fuel className="h-3.5 w-3.5 text-amber-600" />
                        Fuel Expense
                      </span>
                      <span className="text-sm font-bold text-zinc-900">{formatMoney(journey.fuelExpense)}</span>
                    </div>
                    {((journey as any).fuelLitre || (journey as any).fuelRate) && (
                      <p className="text-[11px] text-zinc-500 pt-1">
                        {(journey as any).fuelLitre ? `${(journey as any).fuelLitre} Litres` : ""}{" "}
                        {(journey as any).fuelRate ? `@ ₹${(journey as any).fuelRate}/L` : ""}
                      </p>
                    )}
                  </div>

                  {/* Service */}
                  <div className="p-3 bg-white rounded border border-zinc-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-blue-600" />
                        Service Expense
                      </span>
                      <span className="text-sm font-bold text-zinc-900">{formatMoney(journey.serviceExpense)}</span>
                    </div>
                    {journey.serviceParticulars && (
                      <p className="text-[11px] text-zinc-500 pt-1 truncate" title={journey.serviceParticulars}>
                        {journey.serviceParticulars}
                      </p>
                    )}
                  </div>

                  {/* Maintenance */}
                  <div className="p-3 bg-white rounded border border-zinc-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-orange-600" />
                        Maintenance Expense
                      </span>
                      <span className="text-sm font-bold text-zinc-900">{formatMoney(journey.maintenanceExpense)}</span>
                    </div>
                    {journey.maintenanceParticulars && (
                      <p className="text-[11px] text-zinc-500 pt-1 truncate" title={journey.maintenanceParticulars}>
                        {journey.maintenanceParticulars}
                      </p>
                    )}
                  </div>

                  {/* Tax / Toll / Fastag */}
                  <div className="p-3 bg-white rounded border border-zinc-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5 text-indigo-600" />
                        Tax / Toll Expense
                      </span>
                      <span className="text-sm font-bold text-zinc-900">{formatMoney(journey.taxExpense)}</span>
                    </div>
                    {((journey as any).taxParticulars || (journey as any).fastagBalance) && (
                      <div className="text-[11px] text-zinc-500 pt-1 space-y-0.5">
                        {(journey as any).taxParticulars && <p>{(journey as any).taxParticulars}</p>}
                        {(journey as any).fastagBalance && <p>Fastag Balance: {formatMoney((journey as any).fastagBalance)}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: All 9 Uploaded Bills & Photos */}
            <TabsContent value="documents" className="space-y-3 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {documentsList.map((doc, idx) => {
                  const isUploaded = Boolean(doc.path);
                  const Icon = doc.icon;
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border flex flex-col justify-between gap-2 transition-all ${
                        isUploaded
                          ? "bg-white border-zinc-200 shadow-sm"
                          : "bg-zinc-50/60 border-dashed border-zinc-200 opacity-75"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isUploaded ? (
                            <FileCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                          ) : (
                            <FileX className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                          )}
                          <div>
                            <span className="text-xs font-semibold text-zinc-800 block">
                              {doc.label}
                            </span>
                            <span className="text-[10px] text-zinc-400 block font-medium">
                              {doc.category}
                            </span>
                            {isUploaded && (
                              <span
                                className="text-[11px] text-zinc-500 block truncate max-w-[200px]"
                                title={doc.path || ""}
                              >
                                {doc.path?.split("/").pop() || doc.path}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            isUploaded
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] py-0 px-1.5"
                              : "bg-zinc-100 text-zinc-500 border-zinc-200 text-[10px] py-0 px-1.5"
                          }
                        >
                          {isUploaded ? "Uploaded" : "Missing"}
                        </Badge>
                      </div>

                      {isUploaded && (
                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2">
                          <a
                            href={withBasePath(doc.path!)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded transition-colors"
                            title="Open and view in new tab"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </a>
                          <a
                            href={withBasePath(doc.path!)}
                            download={
                              doc.path?.split("/").pop() ||
                              `${journey.vehicle.registrationNumber}_${doc.label.replace(/\s+/g, "_")}`
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded transition-colors"
                            title="Download to computer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Additional custom photos if any */}
                {journey.photos && journey.photos.length > 0 && (
                  <div className="sm:col-span-2 pt-2 border-t space-y-2">
                    <span className="text-xs font-semibold text-zinc-700 block">Additional Trip Photos:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {journey.photos.map((p, pIdx) => (
                        <a
                          key={pIdx}
                          href={withBasePath(p.path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 bg-white rounded border border-zinc-200 text-xs text-teal-700 hover:bg-teal-50 flex items-center justify-between gap-1"
                        >
                          <span className="truncate">Photo #{pIdx + 1}</span>
                          <Eye className="h-3.5 w-3.5 flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex items-center justify-between pt-3 border-t mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={onEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Edit Journey Log
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Eye Icon View Modal for Vehicles (Registration, Compliance Documents & Warranties)
 */
function VehicleViewDialog({
  vehicle,
  onClose,
  onEdit,
}: {
  vehicle: VehicleWithComputed;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [activeTab, setActiveTab] = useState("overview");

  const vehicleDocs = [
    {
      label: "R.C. Copy",
      path: vehicle.rcCopyPath,
      number: vehicle.rcNumber,
      expiry: vehicle.rcExpiryDate,
    },
    {
      label: "Insurance Copy",
      path: vehicle.insuranceCopyPath,
      number: vehicle.insurancePolicyNumber,
      expiry: vehicle.insuranceExpiryDate,
    },
    {
      label: "P.U.C. Copy",
      path: vehicle.pucCopyPath,
      number: (vehicle as any).pucNumber,
      expiry: vehicle.pucExpiryDate,
    },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                <Car className="h-5 w-5 text-teal-600" />
                Vehicle Profile: {vehicle.registrationNumber}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 mt-1">
                {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" • ") || "Vehicle Details"}
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className={`text-xs px-2.5 py-0.5 ${vehicleStatusVariantMap[vehicle.status]}`}
            >
              {formatEnum(vehicle.status)}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="overview" className="text-xs">
                Overview & Warranties
              </TabsTrigger>
              <TabsTrigger value="documents" className="text-xs">
                RC, Insurance & PUC
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-3 text-sm bg-zinc-50/80 p-4 rounded-lg border border-zinc-100">
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Reg. Number</span>
                  <span className="text-zinc-900 font-semibold">{vehicle.registrationNumber}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Make / Model</span>
                  <span className="text-zinc-900">{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Manufacture Year</span>
                  <span className="text-zinc-900">{vehicle.year ?? "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 font-medium block">Total Journeys Logged</span>
                  <span className="text-zinc-900 font-semibold text-teal-700">{vehicle.journeyLogCount} journeys</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-zinc-200">
                  <span className="text-xs font-semibold text-zinc-700 block mb-2">Warranties:</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-white rounded border border-zinc-200">
                      <span className="text-zinc-500 block">Tyre Warranty Expiry:</span>
                      <span className="font-medium text-zinc-800">{formatDate(vehicle.tyreWarrantyExpiryDate)}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-zinc-200">
                      <span className="text-zinc-500 block">Battery Warranty Expiry:</span>
                      <span className="font-medium text-zinc-800">{formatDate(vehicle.batteryWarrantyExpiryDate)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="space-y-3 mt-0">
              <div className="space-y-3">
                {vehicleDocs.map((doc, idx) => {
                  const isUploaded = Boolean(doc.path);
                  return (
                    <div
                      key={idx}
                      className="p-3 bg-white rounded-lg border border-zinc-200 shadow-sm flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-semibold text-zinc-900 block">{doc.label}</span>
                          <div className="text-xs text-zinc-500 mt-0.5 space-x-3">
                            <span>No: <strong className="text-zinc-700">{doc.number || "—"}</strong></span>
                            <span>Expiry: <strong className="text-zinc-700">{formatDate(doc.expiry)}</strong></span>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            isUploaded
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                              : "bg-zinc-100 text-zinc-500 border-zinc-200 text-[10px]"
                          }
                        >
                          {isUploaded ? "Uploaded" : "Missing"}
                        </Badge>
                      </div>

                      {isUploaded && (
                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2">
                          <a
                            href={withBasePath(doc.path!)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </a>
                          <a
                            href={withBasePath(doc.path!)}
                            download={doc.path?.split("/").pop() || `${vehicle.registrationNumber}_${doc.label}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex items-center justify-between pt-3 border-t mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={onEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Edit Vehicle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VehicleLogBookTable({
  vehicles,
  journeyLogs,
  activeTab,
  page,
  pageSize,
  total,
  totalPages,
  vehicleFilter,
  journeyLogFilter,
  staff,
  cities = [],
}: VehicleLogBookTableProps) {
  const router = useRouter();

  // Edit dialog state
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleWithComputed | null>(null);
  const [createVehicleOpen, setCreateVehicleOpen] = useState(false);
  const [selectedJourney, setSelectedJourney] = useState<JourneyLogWithComputed | null>(null);
  const [createJourneyOpen, setCreateJourneyOpen] = useState(false);

  // Eye view dialog state
  const [viewVehicle, setViewVehicle] = useState<VehicleWithComputed | null>(null);
  const [viewJourney, setViewJourney] = useState<JourneyLogWithComputed | null>(null);

  const typedVehicles = vehicles as VehicleWithComputed[];
  const typedJourneys = journeyLogs as JourneyLogWithComputed[];

  function switchTab(tab: "vehicles" | "journeys") {
    router.push(`/dashboard/vehicle-log-book?tab=${tab}`);
  }

  function buildVehicleQueryString(newPage: number): string {
    const params = new URLSearchParams();
    params.set("tab", "vehicles");
    if (vehicleFilter.search) params.set("search", vehicleFilter.search);
    if (vehicleFilter.status) params.set("status", vehicleFilter.status);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  function buildJourneyQueryString(newPage: number): string {
    const params = new URLSearchParams();
    params.set("tab", "journeys");
    if (journeyLogFilter.search) params.set("search", journeyLogFilter.search);
    if (journeyLogFilter.vehicleId)
      params.set("vehicleId", journeyLogFilter.vehicleId);
    if (journeyLogFilter.approvalStatus)
      params.set("approvalStatus", journeyLogFilter.approvalStatus);
    if (journeyLogFilter.journeyDateFrom)
      params.set(
        "journeyDateFrom",
        journeyLogFilter.journeyDateFrom.toISOString().split("T")[0]
      );
    if (journeyLogFilter.journeyDateTo)
      params.set(
        "journeyDateTo",
        journeyLogFilter.journeyDateTo.toISOString().split("T")[0]
      );
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  function renderVehicleEmpty() {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Car className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No vehicles</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Add a vehicle to start tracking RC, insurance, PUC, and journey logs.
          </p>
        </CardContent>
      </Card>
    );
  }

  function renderJourneyEmpty() {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Route className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No journey logs</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Record a journey to track route, KM, expenses, and approvals.
          </p>
        </CardContent>
      </Card>
    );
  }

  function renderVehicleTable() {
    if (typedVehicles.length === 0) return renderVehicleEmpty();

    return (
      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Reg. No.</TableHead>
                <TableHead className="whitespace-nowrap">Make / Model</TableHead>
                <TableHead className="whitespace-nowrap">Year</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">R.C. Expiry</TableHead>
                <TableHead className="whitespace-nowrap">Insurance Expiry</TableHead>
                <TableHead className="whitespace-nowrap">PUC Expiry</TableHead>
                <TableHead className="whitespace-nowrap">Journeys</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedVehicles.map((row) => (
                <TableRow key={row.id} className="hover:bg-zinc-50/70 transition-colors">
                  <TableCell className="whitespace-nowrap font-medium">
                    <button
                      type="button"
                      onClick={() => setViewVehicle(row)}
                      className="text-left font-semibold text-zinc-900 hover:text-teal-700 hover:underline flex items-center gap-1.5"
                    >
                      <Car className="h-3.5 w-3.5 text-zinc-400" />
                      {row.registrationNumber}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {[row.make, row.model].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono">
                    {row.year ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className={vehicleStatusVariantMap[row.status]}
                    >
                      {formatEnum(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span
                      className={
                        row.isAnyDocumentExpired &&
                        row.rcExpiryDate &&
                        new Date(row.rcExpiryDate) < new Date()
                          ? "text-red-600 font-semibold"
                          : ""
                      }
                    >
                      {formatDate(row.rcExpiryDate)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.insuranceExpiryDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.pucExpiryDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium text-teal-700">
                    {row.journeyLogCount}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-zinc-600 hover:text-teal-700"
                        onClick={() => setViewVehicle(row)}
                        title="View Vehicle Profile & Documents"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-zinc-600 hover:text-zinc-900"
                        onClick={() => setSelectedVehicle(row)}
                        title="Edit vehicle"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    );
  }

  function renderJourneyTable() {
    if (typedJourneys.length === 0) return renderJourneyEmpty();

    return (
      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead className="whitespace-nowrap">Vehicle</TableHead>
                <TableHead className="whitespace-nowrap">Route</TableHead>
                <TableHead className="whitespace-nowrap text-right">Start KM</TableHead>
                <TableHead className="whitespace-nowrap text-right">End KM</TableHead>
                <TableHead className="whitespace-nowrap text-right">Total KM</TableHead>
                <TableHead className="whitespace-nowrap text-right">Expenses (A/c.)</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedJourneys.map((row) => (
                <TableRow key={row.id} className="hover:bg-zinc-50/70 transition-colors">
                  <TableCell className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setViewJourney(row)}
                      className="text-left font-medium text-zinc-900 hover:text-teal-700 hover:underline flex items-center gap-1.5"
                    >
                      <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                      {formatDate(row.journeyDate)}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium text-zinc-800">
                    {row.vehicle.registrationNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-medium text-zinc-900">{row.fromLocation}</span>
                    <span className="text-zinc-400 mx-1">→</span>
                    <span className="font-medium text-zinc-900">{row.toLocation}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {Number(row.startKm).toFixed(2)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {Number(row.endKm).toFixed(2)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono font-bold text-teal-700">
                    {Number(row.totalKm).toFixed(2)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono font-semibold">
                    {formatMoney(row.totalExpenses)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className={approvalVariantMap[row.approvalStatus]}
                    >
                      {formatEnum(row.approvalStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-zinc-600 hover:text-teal-700"
                        onClick={() => setViewJourney(row)}
                        title="View Journey Details & Documents (Eye)"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-zinc-600 hover:text-zinc-900"
                        onClick={() => setSelectedJourney(row)}
                        title="Edit journey log"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    );
  }

  const isVehicles = activeTab === "vehicles";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={isVehicles ? "default" : "outline"}
            size="sm"
            onClick={() => switchTab("vehicles")}
          >
            <Car className="mr-1.5 h-3.5 w-3.5" />
            Vehicles
          </Button>
          <Button
            variant={!isVehicles ? "default" : "outline"}
            size="sm"
            onClick={() => switchTab("journeys")}
          >
            <Route className="mr-1.5 h-3.5 w-3.5" />
            Journey Logs
          </Button>
        </div>
        <Button
          size="sm"
          onClick={() =>
            isVehicles ? setCreateVehicleOpen(true) : setCreateJourneyOpen(true)
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {isVehicles ? "New vehicle" : "New journey"}
        </Button>
      </div>

      {isVehicles ? renderVehicleTable() : renderJourneyTable()}

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
                  `/dashboard/vehicle-log-book${
                    isVehicles
                      ? buildVehicleQueryString(page - 1)
                      : buildJourneyQueryString(page - 1)
                  }`
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
                  `/dashboard/vehicle-log-book${
                    isVehicles
                      ? buildVehicleQueryString(page + 1)
                      : buildJourneyQueryString(page + 1)
                  }`
                )
              }
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* VIEW DIALOGS (Eye icon) */}
      {viewJourney && (
        <JourneyLogViewDialog
          journey={viewJourney}
          onClose={() => setViewJourney(null)}
          onEdit={() => {
            setSelectedJourney(viewJourney);
            setViewJourney(null);
          }}
        />
      )}

      {viewVehicle && (
        <VehicleViewDialog
          vehicle={viewVehicle}
          onClose={() => setViewVehicle(null)}
          onEdit={() => {
            setSelectedVehicle(viewVehicle);
            setViewVehicle(null);
          }}
        />
      )}

      {/* EDIT / CREATE DIALOGS */}
      {selectedVehicle && (
        <VehicleForm
          vehicle={selectedVehicle}
          mode="edit"
          onClose={() => setSelectedVehicle(null)}
        />
      )}

      {createVehicleOpen && (
        <VehicleForm
          mode="create"
          onClose={() => setCreateVehicleOpen(false)}
        />
      )}

      {selectedJourney && (
        <JourneyLogForm
          journeyLog={selectedJourney}
          vehicles={typedVehicles
            .filter(
              (v) =>
                v.status === VehicleStatus.ACTIVE ||
                v.id === selectedJourney.vehicleId
            )
            .map((v) => ({
              id: v.id,
              registrationNumber: v.registrationNumber,
            }))}
          staff={staff}
          cities={cities}
          mode="edit"
          onClose={() => setSelectedJourney(null)}
        />
      )}

      {createJourneyOpen && (
        <JourneyLogForm
          vehicles={typedVehicles
            .filter((v) => v.status === VehicleStatus.ACTIVE)
            .map((v) => ({
              id: v.id,
              registrationNumber: v.registrationNumber,
            }))}
          staff={staff}
          cities={cities}
          mode="create"
          onClose={() => setCreateJourneyOpen(false)}
        />
      )}
    </div>
  );
}

export function VehicleLogBookTableSkeleton() {
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

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
  VehicleFilterInput,
  JourneyLogFilterInput,
} from "@/lib/schemas/vehicle-log-book";
import { VehicleWithComputed, JourneyLogWithComputed } from "@/types/vehicle-log-book";
import { VehicleForm } from "./vehicle-form";
import { JourneyLogForm } from "./journey-log-form";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Route,
  Car,
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
}: VehicleLogBookTableProps) {
  const router = useRouter();
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleWithComputed | null>(null);
  const [createVehicleOpen, setCreateVehicleOpen] = useState(false);
  const [selectedJourney, setSelectedJourney] =
    useState<JourneyLogWithComputed | null>(null);
  const [createJourneyOpen, setCreateJourneyOpen] = useState(false);

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
            Add a vehicle to start tracking RC, insurance, PUC, and journey
            logs.
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
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {row.registrationNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {[row.make, row.model].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
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
                        row.isAnyDocumentExpired && row.rcExpiryDate &&
                        new Date(row.rcExpiryDate) < new Date()
                          ? "text-red-600"
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
                  <TableCell className="whitespace-nowrap">
                    {row.journeyLogCount}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setSelectedVehicle(row)}
                      title="Edit vehicle"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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
                <TableHead className="whitespace-nowrap text-right">Expenses</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedJourneys.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.journeyDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {row.vehicle.registrationNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.fromLocation} → {row.toLocation}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {Number(row.startKm).toFixed(2)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {Number(row.endKm).toFixed(2)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {Number(row.totalKm).toFixed(2)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setSelectedJourney(row)}
                      title="Edit journey log"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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
          vehicles={typedVehicles.map((v) => ({
            id: v.id,
            registrationNumber: v.registrationNumber,
          }))}
          mode="edit"
          onClose={() => setSelectedJourney(null)}
        />
      )}

      {createJourneyOpen && (
        <JourneyLogForm
          vehicles={typedVehicles.map((v) => ({
            id: v.id,
            registrationNumber: v.registrationNumber,
          }))}
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

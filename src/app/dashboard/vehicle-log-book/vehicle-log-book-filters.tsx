"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  VehicleStatus,
  JourneyApprovalStatus,
} from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VehicleFilterInput,
  JourneyLogFilterInput,
} from "@/lib/schemas/vehicle-log-book";
import { Search, X } from "lucide-react";

interface VehicleLogBookFiltersProps {
  initialFilter: VehicleFilterInput | JourneyLogFilterInput;
  activeTab: "vehicles" | "journeys";
  vehicles: { id: string; registrationNumber: string }[];
}

function isVehicleFilter(
  filter: VehicleFilterInput | JourneyLogFilterInput,
  activeTab: "vehicles" | "journeys"
): filter is VehicleFilterInput {
  return activeTab === "vehicles";
}

export function VehicleLogBookFilters({
  initialFilter,
  activeTab,
  vehicles,
}: VehicleLogBookFiltersProps) {
  const router = useRouter();

  const [search, setSearch] = useState(initialFilter.search ?? "");
  const [status, setStatus] = useState(
    isVehicleFilter(initialFilter, activeTab)
      ? (initialFilter.status ?? "")
      : ""
  );
  const [approvalStatus, setApprovalStatus] = useState(
    !isVehicleFilter(initialFilter, activeTab)
      ? ((initialFilter as JourneyLogFilterInput).approvalStatus ?? "")
      : ""
  );
  const [vehicleId, setVehicleId] = useState(
    !isVehicleFilter(initialFilter, activeTab)
      ? ((initialFilter as JourneyLogFilterInput).vehicleId ?? "")
      : ""
  );
  const [journeyDateFrom, setJourneyDateFrom] = useState(
    !isVehicleFilter(initialFilter, activeTab) &&
    (initialFilter as JourneyLogFilterInput).journeyDateFrom
      ? new Date(
          (initialFilter as JourneyLogFilterInput).journeyDateFrom!
        ).toISOString().split("T")[0]
      : ""
  );
  const [journeyDateTo, setJourneyDateTo] = useState(
    !isVehicleFilter(initialFilter, activeTab) &&
    (initialFilter as JourneyLogFilterInput).journeyDateTo
      ? new Date(
          (initialFilter as JourneyLogFilterInput).journeyDateTo!
        ).toISOString().split("T")[0]
      : ""
  );

  function buildQueryString(): string {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    if (search.trim()) params.set("search", search.trim());

    if (activeTab === "vehicles") {
      if (status) params.set("status", status);
    } else {
      if (vehicleId) params.set("vehicleId", vehicleId);
      if (approvalStatus) params.set("approvalStatus", approvalStatus);
      if (journeyDateFrom) params.set("journeyDateFrom", journeyDateFrom);
      if (journeyDateTo) params.set("journeyDateTo", journeyDateTo);
    }

    return params.toString() ? `?${params.toString()}` : "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/vehicle-log-book${buildQueryString()}`);
  }

  function handleClear() {
    setSearch("");
    setStatus("");
    setApprovalStatus("");
    setVehicleId("");
    setJourneyDateFrom("");
    setJourneyDateTo("");
    router.push(`/dashboard/vehicle-log-book?tab=${activeTab}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-1 min-w-48 flex-col gap-1.5">
        <label
          htmlFor="vehicle-log-search"
          className="text-xs font-medium text-zinc-600"
        >
          Search
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            id="vehicle-log-search"
            placeholder={
              activeTab === "vehicles"
                ? "Search registration, make, model…"
                : "Search route, driver, purpose…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      {activeTab === "vehicles" ? (
        <div className="flex min-w-40 flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">Status</label>
          <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
            <SelectTrigger className="w-full min-w-40" size="sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              {Object.values(VehicleStatus).map((s) => (
                <SelectItem key={s} value={s}>
                  {s.toLowerCase().replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <>
          <div className="flex min-w-40 flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">Vehicle</label>
            <Select
              value={vehicleId}
              onValueChange={(v) => setVehicleId(v ?? "")}
            >
              <SelectTrigger className="w-full min-w-40" size="sm">
                <SelectValue placeholder="All vehicles">
                  {(value: string) => value ? vehicles.find((v) => v.id === value)?.registrationNumber ?? "All vehicles" : "All vehicles"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All vehicles</SelectItem>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.registrationNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-40 flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">Approval</label>
            <Select
              value={approvalStatus}
              onValueChange={(v) => setApprovalStatus(v ?? "")}
            >
              <SelectTrigger className="w-full min-w-40" size="sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                {Object.values(JourneyApprovalStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.toLowerCase().replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-36 flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">From</label>
            <Input
              type="date"
              value={journeyDateFrom}
              onChange={(e) => setJourneyDateFrom(e.target.value)}
              className="h-8"
            />
          </div>

          <div className="flex min-w-36 flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">To</label>
            <Input
              type="date"
              value={journeyDateTo}
              onChange={(e) => setJourneyDateTo(e.target.value)}
              className="h-8"
            />
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleClear}>
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </form>
  );
}

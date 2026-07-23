"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TenderStatus, WorkType, ServiceType } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TenderFilterInput } from "@/lib/schemas/tender";
import { Search, X } from "lucide-react";

interface TendersFiltersProps {
  initialFilter: TenderFilterInput;
}

export function TendersFilters({ initialFilter }: TendersFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilter.search ?? "");
  const [status, setStatus] = useState(initialFilter.status ?? "");
  const [workType, setWorkType] = useState(initialFilter.workType ?? "");
  const [serviceType, setServiceType] = useState(
    initialFilter.serviceType ?? ""
  );
  const [state, setState] = useState(initialFilter.state ?? "");
  const [city, setCity] = useState(initialFilter.city ?? "");
  const [platform, setPlatform] = useState(initialFilter.platform ?? "");
  const [fromDate, setFromDate] = useState(
    initialFilter.fromDate
      ? new Date(initialFilter.fromDate).toISOString().split("T")[0]
      : ""
  );
  const [toDate, setToDate] = useState(
    initialFilter.toDate
      ? new Date(initialFilter.toDate).toISOString().split("T")[0]
      : ""
  );

  function buildQueryString(): string {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (workType) params.set("workType", workType);
    if (serviceType) params.set("serviceType", serviceType);
    if (state.trim()) params.set("state", state.trim());
    if (city.trim()) params.set("city", city.trim());
    if (platform.trim()) params.set("platform", platform.trim());
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    return params.toString() ? `?${params.toString()}` : "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/tenders${buildQueryString()}`);
  }

  function handleClear() {
    setSearch("");
    setStatus("");
    setWorkType("");
    setServiceType("");
    setState("");
    setCity("");
    setPlatform("");
    setFromDate("");
    setToDate("");
    router.push("/dashboard/tenders");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-1 min-w-48 flex-col gap-1.5">
        <label
          htmlFor="tender-search"
          className="text-xs font-medium text-zinc-600"
        >
          Search
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            id="tender-search"
            placeholder="Search tender…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Status</label>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            {Object.values(TenderStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {s.toLowerCase().replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Work type</label>
        <Select
          value={workType}
          onValueChange={(v) => setWorkType(v ?? "")}
        >
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All work types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All work types</SelectItem>
            {Object.values(WorkType).map((wt) => (
              <SelectItem key={wt} value={wt}>
                {wt.toLowerCase().replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Service</label>
        <Select
          value={serviceType}
          onValueChange={(v) => setServiceType(v ?? "")}
        >
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All services" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All services</SelectItem>
            {Object.values(ServiceType).map((st) => (
              <SelectItem key={st} value={st}>
                {st.toLowerCase().replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">State</label>
        <Input
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="h-8"
          placeholder="Filter by state"
        />
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">City</label>
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="h-8"
          placeholder="Filter by city"
        />
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Platform</label>
        <Input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="h-8"
          placeholder="Filter by platform"
        />
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">From</label>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-8"
        />
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">To</label>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-8"
        />
      </div>

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

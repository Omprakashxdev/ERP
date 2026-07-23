"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InOutRegisterFilterInput } from "@/lib/schemas/in-out-register";
import { Search, X } from "lucide-react";

interface InOutRegisterFiltersProps {
  initialFilter: InOutRegisterFilterInput;
  clients: { id: string; name: string; abbreviation: string | null }[];
  staff: { id: string; name: string; employeeCode: string | null }[];
}

export function InOutRegisterFilters({
  initialFilter,
  clients,
  staff,
}: InOutRegisterFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilter.search ?? "");
  const [direction, setDirection] = useState(initialFilter.direction ?? "");
  const [clientId, setClientId] = useState(initialFilter.clientId ?? "");
  const [actionSuggestedStaffId, setActionSuggestedStaffId] = useState(
    initialFilter.actionSuggestedStaffId ?? ""
  );
  const [ccStaffId, setCcStaffId] = useState(initialFilter.ccStaffId ?? "");
  const [hasReply, setHasReply] = useState(initialFilter.hasReply ?? "");
  const [receivedDateFrom, setReceivedDateFrom] = useState(
    initialFilter.receivedDateFrom
      ? new Date(initialFilter.receivedDateFrom).toISOString().split("T")[0]
      : ""
  );
  const [receivedDateTo, setReceivedDateTo] = useState(
    initialFilter.receivedDateTo
      ? new Date(initialFilter.receivedDateTo).toISOString().split("T")[0]
      : ""
  );
  const [ageDue, setAgeDue] = useState(initialFilter.ageDue ?? "");

  function buildQueryString(): string {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (direction) params.set("direction", direction);
    if (clientId) params.set("clientId", clientId);
    if (actionSuggestedStaffId)
      params.set("actionSuggestedStaffId", actionSuggestedStaffId);
    if (ccStaffId) params.set("ccStaffId", ccStaffId);
    if (hasReply) params.set("hasReply", hasReply);
    if (receivedDateFrom) params.set("receivedDateFrom", receivedDateFrom);
    if (receivedDateTo) params.set("receivedDateTo", receivedDateTo);
    if (ageDue) params.set("ageDue", ageDue);
    return params.toString() ? `?${params.toString()}` : "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/in-out-register${buildQueryString()}`);
  }

  function handleClear() {
    setSearch("");
    setDirection("");
    setClientId("");
    setActionSuggestedStaffId("");
    setCcStaffId("");
    setHasReply("");
    setReceivedDateFrom("");
    setReceivedDateTo("");
    setAgeDue("");
    router.push("/dashboard/in-out-register");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-1 min-w-48 flex-col gap-1.5">
        <label
          htmlFor="in-out-search"
          className="text-xs font-medium text-zinc-600"
        >
          Search
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            id="in-out-search"
            placeholder="Search ref. no, details, or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Direction</label>
        <Select value={direction} onValueChange={(v) => setDirection(v ?? "")}>
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="INWARD">Inward</SelectItem>
            <SelectItem value="OUTWARD">Outward</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-48 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">From / To</label>
        <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
          <SelectTrigger className="w-full min-w-48" size="sm">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-48 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Action suggested</label>
        <Select
          value={actionSuggestedStaffId}
          onValueChange={(v) => setActionSuggestedStaffId(v ?? "")}
        >
          <SelectTrigger className="w-full min-w-48" size="sm">
            <SelectValue placeholder="All staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All staff</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-48 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">CC marked</label>
        <Select
          value={ccStaffId}
          onValueChange={(v) => setCcStaffId(v ?? "")}
        >
          <SelectTrigger className="w-full min-w-48" size="sm">
            <SelectValue placeholder="All staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All staff</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Reply status</label>
        <Select value={hasReply} onValueChange={(v) => setHasReply(v ?? "")}>
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="false">Pending reply</SelectItem>
            <SelectItem value="true">Replied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Rec. from</label>
        <Input
          type="date"
          value={receivedDateFrom}
          onChange={(e) => setReceivedDateFrom(e.target.value)}
          className="h-8"
        />
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Rec. to</label>
        <Input
          type="date"
          value={receivedDateTo}
          onChange={(e) => setReceivedDateTo(e.target.value)}
          className="h-8"
        />
      </div>

      <div className="flex min-w-32 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Age due</label>
        <Select value={ageDue} onValueChange={(v) => setAgeDue(v ?? "")}>
          <SelectTrigger className="w-full min-w-32" size="sm">
            <SelectValue placeholder="Any age" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any age</SelectItem>
            <SelectItem value="15">≥ 15 days</SelectItem>
            <SelectItem value="20">≥ 20 days</SelectItem>
            <SelectItem value="25">≥ 25 days</SelectItem>
          </SelectContent>
        </Select>
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

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
  projects?: { id: string; name: string; abbreviation: string | null; clientId: string }[];
  departments?: { id: string; name: string }[];
  staff: { id: string; name: string; employeeCode: string | null }[];
}

export function InOutRegisterFilters({
  initialFilter,
  clients,
  projects = [],
  departments,
  staff,
}: InOutRegisterFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilter.search ?? "");
  const [direction, setDirection] = useState(initialFilter.direction ?? "");
  const [clientId, setClientId] = useState(initialFilter.clientId ?? "");
  const [projectId, setProjectId] = useState(initialFilter.projectId ?? "");
  const [department, setDepartment] = useState(initialFilter.department ?? "");
  const [actionSuggestedStaffId, setActionSuggestedStaffId] = useState(
    initialFilter.actionSuggestedStaffId ?? ""
  );
  const [ccStaffId, setCcStaffId] = useState(initialFilter.ccStaffId ?? "");
  const [hasDeadline, setHasDeadline] = useState(initialFilter.hasDeadline ?? "");
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
    if (projectId) params.set("projectId", projectId);
    if (department.trim()) params.set("department", department.trim());
    if (actionSuggestedStaffId)
      params.set("actionSuggestedStaffId", actionSuggestedStaffId);
    if (ccStaffId) params.set("ccStaffId", ccStaffId);
    if (hasDeadline) params.set("hasDeadline", hasDeadline);
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
    setProjectId("");
    setDepartment("");
    setActionSuggestedStaffId("");
    setCcStaffId("");
    setHasDeadline("");
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
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            id="in-out-search"
            placeholder="Search ref. no, details, client, or dept…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600" htmlFor="in-out-register-direction">Direction</label>
        <Select value={direction} onValueChange={(v) => setDirection(v ?? "")}>
          <SelectTrigger id="in-out-register-direction" className="w-full min-w-40" size="sm">
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
        <label className="text-xs font-medium text-zinc-600" htmlFor="in-out-register-from-to">From / To</label>
        <Select value={clientId} onValueChange={(v) => {
          const next = v ?? "";
          setClientId(next);
          if (projectId && next && !projects.some((p) => p.id === projectId && p.clientId === next)) {
            setProjectId("");
          }
        }}>
          <SelectTrigger id="in-out-register-from-to" className="w-full min-w-48" size="sm">
            <SelectValue placeholder="All clients">
              {(value: string) => value ? clients.find((c) => c.id === value)?.name ?? "All clients" : "All clients"}
            </SelectValue>
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
        <label className="text-xs font-medium text-zinc-600" htmlFor="in-out-register-project">Related Project</label>
        <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
          <SelectTrigger id="in-out-register-project" className="w-full min-w-48" size="sm">
            <SelectValue placeholder="All projects">
              {(value: string) => value ? projects.find((p) => p.id === value)?.name ?? "All projects" : "All projects"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All projects</SelectItem>
            {(clientId ? projects.filter((p) => p.clientId === clientId) : projects).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label htmlFor="filter-department" className="text-xs font-medium text-zinc-600">
          Department / Div.
        </label>
        <Input
          id="filter-department"
          list="filter-department-suggestions"
          placeholder="Filter dept…"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="h-8 text-xs"
        />
        {departments && departments.length > 0 && (
          <datalist id="filter-department-suggestions">
            {departments.map((d) => (
              <option key={d.id} value={d.name} />
            ))}
          </datalist>
        )}
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600" htmlFor="in-out-register-deadline-status">Deadline Status</label>
        <Select value={hasDeadline} onValueChange={(v) => setHasDeadline(v ?? "")}>
          <SelectTrigger id="in-out-register-deadline-status" className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="true">Has Due Date</SelectItem>
            <SelectItem value="false">No Due Date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600" htmlFor="in-out-register-rec-from">Rec. from</label>
        <Input id="in-out-register-rec-from"
          type="date"
          value={receivedDateFrom}
          onChange={(e) => setReceivedDateFrom(e.target.value)}
          className="h-8"
        />
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600" htmlFor="in-out-register-rec-to">Rec. to</label>
        <Input id="in-out-register-rec-to"
          type="date"
          value={receivedDateTo}
          onChange={(e) => setReceivedDateTo(e.target.value)}
          className="h-8"
        />
      </div>

      <div className="flex min-w-32 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600" htmlFor="in-out-register-age-due">Age due</label>
        <Select value={ageDue} onValueChange={(v) => setAgeDue(v ?? "")}>
          <SelectTrigger id="in-out-register-age-due" className="w-full min-w-32" size="sm">
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

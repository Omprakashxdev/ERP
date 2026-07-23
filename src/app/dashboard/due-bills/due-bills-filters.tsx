"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DueBillStatus } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DueBillFilterInput } from "@/lib/schemas/due-bill";
import { Search, X } from "lucide-react";

interface DueBillsFiltersProps {
  regions: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  initialFilter: DueBillFilterInput;
}

export function DueBillsFilters({
  regions,
  clients,
  projects,
  initialFilter,
}: DueBillsFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilter.search ?? "");
  const [regionId, setRegionId] = useState(initialFilter.regionId ?? "");
  const [clientId, setClientId] = useState(initialFilter.clientId ?? "");
  const [projectId, setProjectId] = useState(initialFilter.projectId ?? "");
  const [status, setStatus] = useState(initialFilter.status ?? "");
  const [scheme, setScheme] = useState(initialFilter.scheme ?? "");

  function buildQueryString(): string {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (regionId) params.set("regionId", regionId);
    if (clientId) params.set("clientId", clientId);
    if (projectId) params.set("projectId", projectId);
    if (status) params.set("status", status);
    if (scheme.trim()) params.set("scheme", scheme.trim());
    return params.toString() ? `?${params.toString()}` : "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/due-bills${buildQueryString()}`);
  }

  function handleClear() {
    setSearch("");
    setRegionId("");
    setClientId("");
    setProjectId("");
    setStatus("");
    setScheme("");
    router.push("/dashboard/due-bills");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-1 min-w-48 flex-col gap-1.5">
        <label htmlFor="due-bills-search" className="text-xs font-medium text-zinc-600">
          Search
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            id="due-bills-search"
            placeholder="Search project or scheme…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Region</label>
        <Select value={regionId} onValueChange={(v) => setRegionId(v ?? "")}>
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All regions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All regions</SelectItem>
            {regions.map((region) => (
              <SelectItem key={region.id} value={region.id}>
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Client</label>
        <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All clients</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Project</label>
        <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-32 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Status</label>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
          <SelectTrigger className="w-full min-w-32" size="sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            {Object.values(DueBillStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {s.toLowerCase().replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-32 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Scheme</label>
        <Input
          placeholder="Filter scheme…"
          value={scheme}
          onChange={(e) => setScheme(e.target.value)}
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

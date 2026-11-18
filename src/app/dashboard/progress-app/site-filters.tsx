"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressSiteStatus } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProgressSiteFilterInput } from "@/lib/schemas/progress-site";
import { Search, X } from "lucide-react";

interface SiteFiltersProps {
  initialFilter: ProgressSiteFilterInput;
}

const STATUS_LABELS: Record<ProgressSiteStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export function SiteFilters({ initialFilter }: SiteFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilter.search ?? "");
  const [status, setStatus] = useState(initialFilter.status ?? "");

  function buildQueryString(): string {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    return params.toString() ? `?${params.toString()}` : "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/progress-app${buildQueryString()}`);
  }

  function handleClear() {
    setSearch("");
    setStatus("");
    router.push("/dashboard/progress-app");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-1 min-w-48 flex-col gap-1.5">
        <label
          htmlFor="site-search"
          className="text-xs font-medium text-zinc-600"
        >
          Search
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            id="site-search"
            placeholder="Search by site name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label
          className="text-xs font-medium text-zinc-600"
          htmlFor="site-status"
        >
          Status
        </label>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
          <SelectTrigger id="site-status" className="w-full min-w-36" size="sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            {Object.values(ProgressSiteStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
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

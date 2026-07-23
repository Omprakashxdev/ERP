"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AssetStatus } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssetFilterInput } from "@/lib/schemas/asset";
import { Search, X } from "lucide-react";

interface AssetsFiltersProps {
  initialFilter: AssetFilterInput;
}

export function AssetsFilters({ initialFilter }: AssetsFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilter.search ?? "");
  const [category, setCategory] = useState(initialFilter.category ?? "");
  const [status, setStatus] = useState(initialFilter.status ?? "");
  const [yearOfPurchase, setYearOfPurchase] = useState(
    initialFilter.yearOfPurchase ? String(initialFilter.yearOfPurchase) : ""
  );

  function buildQueryString(): string {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (yearOfPurchase) params.set("yearOfPurchase", yearOfPurchase);
    return params.toString() ? `?${params.toString()}` : "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/assets${buildQueryString()}`);
  }

  function handleClear() {
    setSearch("");
    setCategory("");
    setStatus("");
    setYearOfPurchase("");
    router.push("/dashboard/assets");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-1 min-w-48 flex-col gap-1.5">
        <label
          htmlFor="asset-search"
          className="text-xs font-medium text-zinc-600"
        >
          Search
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            id="asset-search"
            placeholder="Search item code, name, make, model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Category</label>
        <Input
          placeholder="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-8"
        />
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Status</label>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            {Object.values(AssetStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {s.toLowerCase().replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-32 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Year</label>
        <Input
          type="number"
          placeholder="e.g. 2023"
          value={yearOfPurchase}
          onChange={(e) => setYearOfPurchase(e.target.value)}
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

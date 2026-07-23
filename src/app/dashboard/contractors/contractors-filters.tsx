"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ContractorFilterInput } from "@/lib/schemas/contractor";
import { Search, X } from "lucide-react";

interface ContractorsFiltersProps {
  initialFilter: ContractorFilterInput;
}

export function ContractorsFilters({
  initialFilter,
}: ContractorsFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilter.search ?? "");

  function buildQueryString(): string {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    return params.toString() ? `?${params.toString()}` : "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/contractors${buildQueryString()}`);
  }

  function handleClear() {
    setSearch("");
    router.push("/dashboard/contractors");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-1 min-w-48 flex-col gap-1.5">
        <label
          htmlFor="contractor-search"
          className="text-xs font-medium text-zinc-600"
        >
          Search
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            id="contractor-search"
            placeholder="Search contractors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
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

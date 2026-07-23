"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";

interface StaffOption {
  id: string;
  name: string;
}

const statusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "MANAGER_APPROVED", label: "Manager Approved" },
  { value: "MANAGER_REJECTED", label: "Manager Rejected" },
  { value: "ACCOUNTS_VERIFIED", label: "Accounts Verified" },
  { value: "ACCOUNTS_QUERY", label: "Accounts Query" },
  { value: "FINANCE_APPROVED", label: "Finance Approved" },
  { value: "PAID", label: "Paid" },
];

export function TadaBillsFilters({ staff }: { staff: StaffOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`/dashboard/tada-bills?${params.toString()}`);
    },
    [router, searchParams]
  );

  const hasFilters = searchParams.has("search") || searchParams.has("staffId") || searchParams.has("status");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <Input
          placeholder="Search claims…"
          defaultValue={searchParams.get("search") ?? ""}
          onChange={(e) => updateParam("search", e.target.value || undefined)}
          className="h-8 pl-8"
        />
      </div>

      <Select
        value={searchParams.get("staffId") ?? ""}
        onValueChange={(v) => updateParam("staffId", v || undefined)}
      >
        <SelectTrigger className="h-8 w-40" size="sm">
          <SelectValue placeholder="All staff" />
        </SelectTrigger>
        <SelectContent>
          {staff.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("status") ?? ""}
        onValueChange={(v) => updateParam("status", v || undefined)}
      >
        <SelectTrigger className="h-8 w-40" size="sm">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/tada-bills")}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

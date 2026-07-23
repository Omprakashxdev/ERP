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
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "PENDING_REVIEW", label: "Pending Review" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const priorityOptions = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

export function TaskFilters({ staff }: { staff: StaffOption[] }) {
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
      router.push(`/dashboard/tasks?${params.toString()}`);
    },
    [router, searchParams]
  );

  const hasFilters =
    searchParams.has("search") ||
    searchParams.has("assignedToId") ||
    searchParams.has("status") ||
    searchParams.has("priority") ||
    searchParams.has("overdue");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <Input
          placeholder="Search tasks…"
          defaultValue={searchParams.get("search") ?? ""}
          onChange={(e) => updateParam("search", e.target.value || undefined)}
          className="h-8 pl-8"
        />
      </div>

      <Select
        value={searchParams.get("assignedToId") ?? ""}
        onValueChange={(v) => updateParam("assignedToId", v || undefined)}
      >
        <SelectTrigger className="h-8 w-40" size="sm">
          <SelectValue placeholder="All assignees" />
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
        <SelectTrigger className="h-8 w-36" size="sm">
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

      <Select
        value={searchParams.get("priority") ?? ""}
        onValueChange={(v) => updateParam("priority", v || undefined)}
      >
        <SelectTrigger className="h-8 w-32" size="sm">
          <SelectValue placeholder="All priorities" />
        </SelectTrigger>
        <SelectContent>
          {priorityOptions.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("overdue") ?? ""}
        onValueChange={(v) => updateParam("overdue", v || undefined)}
      >
        <SelectTrigger className="h-8 w-28" size="sm">
          <SelectValue placeholder="Overdue" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Overdue only</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/tasks")}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

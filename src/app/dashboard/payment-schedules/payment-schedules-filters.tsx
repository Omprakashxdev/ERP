"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PaymentScheduleCategory,
  PaymentScheduleStatus,
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
import { PaymentScheduleFilterInput } from "@/lib/schemas/payment-schedule";
import { Search, X } from "lucide-react";

interface PaymentSchedulesFiltersProps {
  initialFilter: PaymentScheduleFilterInput;
}

export function PaymentSchedulesFilters({
  initialFilter,
}: PaymentSchedulesFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilter.search ?? "");
  const [category, setCategory] = useState(initialFilter.category ?? "");
  const [status, setStatus] = useState(initialFilter.status ?? "");
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
  const [dueDateFrom, setDueDateFrom] = useState(
    initialFilter.dueDateFrom
      ? new Date(initialFilter.dueDateFrom).toISOString().split("T")[0]
      : ""
  );
  const [dueDateTo, setDueDateTo] = useState(
    initialFilter.dueDateTo
      ? new Date(initialFilter.dueDateTo).toISOString().split("T")[0]
      : ""
  );

  function buildQueryString(): string {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (dueDateFrom) params.set("dueDateFrom", dueDateFrom);
    if (dueDateTo) params.set("dueDateTo", dueDateTo);
    return params.toString() ? `?${params.toString()}` : "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/payment-schedules${buildQueryString()}`);
  }

  function handleClear() {
    setSearch("");
    setCategory("");
    setStatus("");
    setFromDate("");
    setToDate("");
    setDueDateFrom("");
    setDueDateTo("");
    router.push("/dashboard/payment-schedules");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-1 min-w-48 flex-col gap-1.5">
        <label
          htmlFor="payment-schedule-search"
          className="text-xs font-medium text-zinc-600"
        >
          Search
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            id="payment-schedule-search"
            placeholder="Search payment detail or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Category</label>
        <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All categories</SelectItem>
            {Object.values(PaymentScheduleCategory).map((c) => (
              <SelectItem key={c} value={c}>
                {c.toLowerCase().replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Status</label>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
          <SelectTrigger className="w-full min-w-40" size="sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            {Object.values(PaymentScheduleStatus).map((s) => (
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

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Due from</label>
        <Input
          type="date"
          value={dueDateFrom}
          onChange={(e) => setDueDateFrom(e.target.value)}
          className="h-8"
        />
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600">Due to</label>
        <Input
          type="date"
          value={dueDateTo}
          onChange={(e) => setDueDateTo(e.target.value)}
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

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { List, Building2 } from "lucide-react";

export function DueBillsViewToggle({ currentView }: { currentView: "list" | "summary" }) {
  const router = useRouter();
  const params = useSearchParams();

  function switchView(view: "list" | "summary") {
    const searchParams = new URLSearchParams(params.toString());
    if (view === "summary") {
      searchParams.set("view", "summary");
    } else {
      searchParams.delete("view");
    }
    router.push(`/dashboard/due-bills?${searchParams.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5">
      <Button
        variant={currentView === "list" ? "default" : "ghost"}
        size="sm"
        className="h-7"
        onClick={() => switchView("list")}
      >
        <List className="mr-1 h-3.5 w-3.5" />
        List
      </Button>
      <Button
        variant={currentView === "summary" ? "default" : "ghost"}
        size="sm"
        className="h-7"
        onClick={() => switchView("summary")}
      >
        <Building2 className="mr-1 h-3.5 w-3.5" />
        Summary
      </Button>
    </div>
  );
}

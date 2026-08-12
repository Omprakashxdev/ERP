import { Database } from "lucide-react";
import { MastersManager } from "@/components/masters/masters-manager";

export const metadata = {
  title: "Masters — SAEC ERP",
};

export default function MastersPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
          <Database className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Masters</h1>
          <p className="text-sm text-zinc-500">
            Manage lookup data used across all modules
          </p>
        </div>
      </div>

      <MastersManager />
    </div>
  );
}

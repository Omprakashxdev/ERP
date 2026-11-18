import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge, AlertTriangle } from "lucide-react";
import {
  ProgressBar,
  RollupLike,
  formatPercent,
} from "./progress-bar";

/**
 * Aggregate progress card for a hierarchy node. Shows raw
 * completed/total activity counts, a bar, and the count of rooms that
 * have no checklist so a partially configured parent never appears
 * silently complete.
 */
export function ProgressSummaryCard({
  title,
  rollup,
}: {
  title: string;
  rollup: RollupLike;
}) {
  const configured = rollup.percent !== null;
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <Gauge className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {configured ? (
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <span className="text-2xl font-semibold tracking-tight text-zinc-900">
                {formatPercent(rollup.percent)}
              </span>
              <span className="text-xs text-zinc-500">
                {rollup.completedActivities} of {rollup.totalActivities}{" "}
                activities completed · {rollup.configuredRooms}{" "}
                {rollup.configuredRooms === 1 ? "room" : "rooms"} configured
              </span>
            </div>
            <ProgressBar percent={rollup.percent} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Progress not configured.</p>
        )}
        {rollup.unconfiguredRooms > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            {rollup.unconfiguredRooms}{" "}
            {rollup.unconfiguredRooms === 1 ? "room has" : "rooms have"} no
            checklist — excluded from progress.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

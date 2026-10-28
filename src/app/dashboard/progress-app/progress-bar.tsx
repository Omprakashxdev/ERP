export interface RollupLike {
  totalActivities: number;
  completedActivities: number;
  configuredRooms: number;
  unconfiguredRooms: number;
  percent: number | null;
}

export function formatPercent(percent: number | null): string {
  if (percent === null) return "—";
  const rounded = Math.round(percent * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}%`;
}

export function ProgressBar({
  percent,
  className = "",
}: {
  percent: number | null;
  className?: string;
}) {
  if (percent === null) {
    return (
      <div className={`h-1.5 w-full rounded-full bg-zinc-100 ${className}`} />
    );
  }
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all ${
          clamped >= 100 ? "bg-emerald-500" : "bg-zinc-700"
        }`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Compact cell content for children tables — bar + "x/y" + percent. */
export function ProgressCell({ rollup }: { rollup?: RollupLike | null }) {
  if (!rollup || rollup.percent === null) {
    return (
      <span className="text-[11px] text-zinc-400">Not configured</span>
    );
  }
  return (
    <div className="min-w-28">
      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
        <span>
          {rollup.completedActivities}/{rollup.totalActivities}
        </span>
        <span className="font-medium text-zinc-700">
          {formatPercent(rollup.percent)}
        </span>
      </div>
      <ProgressBar percent={rollup.percent} className="mt-1" />
    </div>
  );
}

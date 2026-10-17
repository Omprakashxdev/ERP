// Shared Fund Flow monthly-allocation window — plain module (no "use server")
// so both server actions and client components can import it safely.

export interface MonthWindow {
  year: number;
  month: number;
  label: string;
}

export const MONTHLY_ALLOCATION_WINDOW: MonthWindow[] = (() => {
  const months: MonthWindow[] = [];
  const startYear = 2026;
  const startMonth = 4; // April
  for (let i = 0; i < 24; i++) {
    const monthIndex = startMonth - 1 + i; // 0-based
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const d = new Date(year, month - 1, 1);
    months.push({
      year,
      month,
      label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }),
    });
  }
  return months;
})();

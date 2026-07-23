"use server";

import { withPermission, audit, ActionResult } from "./wrapper";
import { runReport as runReportEngine } from "@/lib/reports";

export async function runReportAction(
  reportId: string,
  params?: { dateFrom?: Date; dateTo?: Date; groupBy?: string }
): Promise<ActionResult<{ columns: string[]; rows: Record<string, unknown>[]; summary?: Record<string, number> }>> {
  return withPermission("reports", "read", async (user) => {
    const result = await runReportEngine(reportId, params);
    await audit(user.id, "read", "Report", reportId, { groupBy: params?.groupBy });
    return result;
  });
}

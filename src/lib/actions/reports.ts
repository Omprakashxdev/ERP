"use server";

import { withPermission, audit, ActionResult } from "./wrapper";
import { runReport as runReportEngine, ReportFilterParams } from "@/lib/reports";

export async function runReportAction(
  reportId: string,
  params?: ReportFilterParams
): Promise<ActionResult<{ columns: string[]; rows: Record<string, unknown>[]; summary?: Record<string, number> }>> {
  return withPermission("reports", "read", async (user) => {
    const result = await runReportEngine(reportId, params);
    await audit(user.id, "read", "Report", reportId, { groupBy: params?.groupBy, clientId: params?.clientId, staffId: params?.staffId });
    return result;
  });
}

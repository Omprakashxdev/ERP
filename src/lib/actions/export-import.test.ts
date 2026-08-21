import { describe, it, expect, vi } from 'vitest';
import * as xlsx from 'xlsx';
import { getModuleTemplate, importModule } from './export-import';

// Mock auth wrapper
vi.mock('./wrapper', () => ({
  withPermission: async (resource: any, action: any, handler: any) => {
    try {
      const data = await handler({ id: "test-user-id" });
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
  audit: async () => {},
  checkRateLimit: async () => {},
}));

describe('Bulk Import Templates', () => {
  const modules = [
    "fundFlow",
    "dueBills",
    "wip",
    "contractors",
    "tenders",
    "paymentSchedules",
    "vehicleLogBook",
    "assets",
    "inOutRegister",
    "tadaBills",
    "tasks",
    "clients",
    "staff",
  ];

  for (const mod of modules) {
    it(`should successfully parse the sample row for ${mod}`, async () => {
      const res = await getModuleTemplate(mod);
      if (!res.success) {
        console.error(`Failed to get template for ${mod}:`, (res as any).error);
      }
      expect(res.success).toBe(true);
      
      const csvContent = (res as any).data.content;
      const workbook = xlsx.read(csvContent, { type: "string" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const parsedData = xlsx.utils.sheet_to_json(sheet, { defval: "" });

      if (parsedData.length > 0) {
        // Run import
        const importRes = await importModule({
          module: mod,
          format: "csv",
          data: csvContent
        });
        if (!importRes.success) {
          console.error(`Error importing ${mod}:`, (importRes as any).error);
        }
        expect(importRes.success).toBe(true);
      }
    });
  }
});

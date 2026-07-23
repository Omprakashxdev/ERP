"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportModule, importModule } from "@/lib/actions/export-import";
import { EXPORTABLE_MODULES, MODULE_EXPORT_CONFIGS } from "@/lib/export-import";
import {
  Download,
  Upload,
  Loader2,
  FileDown,
  FileUp,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

export function ExportImportPanel() {
  const [module, setModule] = useState("");
  const [format, setFormat] = useState("csv");
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importData, setImportData] = useState("");
  const [result, setResult] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  async function handleExport() {
    if (!module) return;
    setExportLoading(true);
    setResult(null);

    const res = await exportModule({ module: module as never, format: format as "csv" | "json" | "xlsx" });
    setExportLoading(false);

    if (res.success && res.data) {
      let blob: Blob;
      if (res.data.isBase64) {
        const binary = atob(res.data.content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      } else {
        blob = new Blob([res.data.content], {
          type: format === "csv" ? "text/csv" : "application/json",
        });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      a.click();
      URL.revokeObjectURL(url);
      setResult({
        type: "success",
        message: `Exported ${module} as ${format.toUpperCase()} successfully.`,
      });
    } else {
      setResult({ type: "error", message: res.error ?? "Export failed." });
    }
  }

  async function handleImport() {
    if (!module || !importData.trim()) return;
    setImportLoading(true);
    setResult(null);

    const res = await importModule({
      module: module as never,
      format: format as "csv" | "json",
      data: importData,
    });

    setImportLoading(false);

    if (res.success && res.data) {
      const { imported, errors } = res.data;
      setResult({
        type: "success",
        message: `Imported ${imported} record(s)${
          errors.length > 0 ? ` with ${errors.length} error(s)` : ""
        }.`,
      });
      if (errors.length > 0) {
        console.error("Import errors:", errors);
      }
      setImportData("");
    } else {
      setResult({ type: "error", message: res.error ?? "Import failed." });
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportData(String(ev.target?.result ?? ""));
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">Module</label>
          <Select value={module} onValueChange={(v) => setModule(v ?? "")}>
            <SelectTrigger className="w-full min-w-56" size="sm">
              <SelectValue placeholder="Select module" />
            </SelectTrigger>
            <SelectContent>
              {EXPORTABLE_MODULES.map((key) => (
                <SelectItem key={key} value={key}>
                  {MODULE_EXPORT_CONFIGS[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-32 flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">Format</label>
          <Select value={format} onValueChange={(v) => setFormat(v ?? "csv")}>
            <SelectTrigger className="w-full min-w-32" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="xlsx">XLSX (Excel)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          onClick={handleExport}
          disabled={!module || exportLoading}
        >
          {exportLoading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Export
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <FileDown className="h-4 w-4 text-zinc-400" />
            Export Data
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Select a module and format, then click Export to download all
            records as a file.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <FileUp className="h-4 w-4 text-zinc-400" />
            Import Data
          </div>
          <p className="text-xs text-zinc-500">
            Upload a {format.toUpperCase()} file or paste content below. Supports
            contractors, tenders, payment schedules, and assets.
          </p>

          <input
            type="file"
            accept={format === "csv" ? ".csv" : ".json"}
            onChange={handleFileUpload}
            className="text-xs text-zinc-500 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
          />

          <textarea
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            placeholder={`Paste ${format.toUpperCase()} data here…`}
            className="min-h-32 w-full rounded-md border border-zinc-200 p-3 font-mono text-xs"
          />

          <Button
            size="sm"
            onClick={handleImport}
            disabled={!module || !importData.trim() || importLoading}
          >
            {importLoading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            Import
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
            result.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {result.type === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {result.message}
        </div>
      )}
    </div>
  );
}

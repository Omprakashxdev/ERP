"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Upload, Download, Loader2, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { importModule, getModuleTemplate } from "@/lib/actions/export-import";

interface BulkImportDialogProps {
  module: string;
  moduleLabel: string;
}

export function BulkImportDialog({ module, moduleLabel }: BulkImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [importData, setImportData] = useState("");
  const [result, setResult] = useState<
    { type: "success" | "error"; message: string; errors?: string[] } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDownloadTemplate(format: "csv" | "xlsx") {
    setTemplateLoading(true);
    const res = await getModuleTemplate(module);
    setTemplateLoading(false);

    if (res.success && res.data) {
      if (format === "xlsx") {
        const rows = [res.data.content.split(",")];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, res.data.filename.replace(".csv", ".xlsx"));
      } else {
        const blob = new Blob([res.data.content], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.data.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      setResult({ type: "error", message: res.error ?? "Failed to generate template" });
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(ws);
          setImportData(csv);
        } catch {
          setResult({ type: "error", message: "Failed to parse Excel file. Please check the file format." });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImportData(String(ev.target?.result ?? ""));
      };
      reader.readAsText(file);
    }
  }

  async function handleImport() {
    if (!importData.trim()) return;
    setLoading(true);
    setResult(null);

    const res = await importModule({
      module: module as never,
      format: "csv",
      data: importData,
    });

    setLoading(false);

    if (res.success && res.data) {
      const { imported, errors } = res.data;
      setResult({
        type: "success",
        message: `Imported ${imported} record(s)${errors.length > 0 ? ` with ${errors.length} error(s)` : ""}.`,
        errors: errors.length > 0 ? errors : undefined,
      });
      if (errors.length === 0) {
        setImportData("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        setTimeout(() => {
          setOpen(false);
          setResult(null);
          window.location.reload();
        }, 1500);
      }
    } else {
      setResult({ type: "error", message: res.error ?? "Import failed." });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="h-3.5 w-3.5" />
            Bulk Import
          </Button>
        }
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-teal-600" />
            Bulk Import — {moduleLabel}
          </DialogTitle>
          <DialogDescription>
Upload a CSV or Excel file to bulk import {moduleLabel.toLowerCase()} records. Download the template first to see required columns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Download Template</p>
              <p className="text-xs text-muted-foreground">
                Get the correct column headers for this module
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadTemplate("csv")}
                disabled={templateLoading}
                className="gap-2"
              >
                {templateLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadTemplate("xlsx")}
                disabled={templateLoading}
                className="gap-2"
              >
                {templateLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Excel
              </Button>
            </div>
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Upload File (CSV or Excel)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-teal-700 hover:file:bg-teal-100"
            />
          </div>

          {/* Paste area */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Or Paste CSV Data</label>
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="Paste CSV data here…"
              className="min-h-32 w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
            />
          </div>

          {/* Import button */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={!importData.trim() || loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Import
            </Button>
          </div>

          {/* Result */}
          {result && (
            <div
              className={`rounded-md p-3 text-sm ${
                result.type === "success"
                  ? "bg-teal-50 text-teal-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              <div className="flex items-center gap-2">
                {result.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{result.message}</span>
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto rounded bg-red-100/50 p-2 text-xs">
                  {result.errors.slice(0, 10).map((err, i) => (
                    <div key={i} className="py-0.5">{err}</div>
                  ))}
                  {result.errors.length > 10 && (
                    <div className="py-0.5 font-medium">…and {result.errors.length - 10} more</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

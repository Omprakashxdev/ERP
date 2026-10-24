"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, ExternalLink, FileWarning, Loader2 } from "lucide-react";
import { documentDisplayName } from "@/components/ui/file-upload-field";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

interface PdfPreviewDialogProps {
  /** Stored document path (private `inout-priv/…` or legacy `/uploads/…`). */
  documentPath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function documentUrl(path: string, download = false) {
  return withBasePath(
    `/api/in-out-documents?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`
  );
}

/**
 * Same-screen PDF preview for In-Out Register attachments.
 * Serves the file through the authenticated /api/in-out-documents endpoint,
 * so private and legacy stored paths both resolve server-side.
 */
export function PdfPreviewDialog({ documentPath, open, onOpenChange }: PdfPreviewDialogProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const checkId = useRef(0);

  const fileName = documentPath ? documentDisplayName(documentPath) : "";
  const viewUrl = documentPath ? documentUrl(documentPath) : "";
  const downloadUrl = documentPath ? documentUrl(documentPath, true) : "";

  useEffect(() => {
    if (!open || !documentPath) return;
    const id = ++checkId.current;
    setStatus("loading");
    setErrorMessage(null);

    // Preflight the file so a missing/unreadable document shows a clear
    // message instead of an empty iframe.
    fetch(`${documentUrl(documentPath)}&meta=1`)
      .then(async (res) => {
        if (id !== checkId.current) return;
        if (res.ok) {
          setStatus("ready");
          return;
        }
        let message = "This document could not be loaded.";
        try {
          const data = await res.json();
          if (typeof data?.error === "string") message = data.error;
        } catch {
          // non-JSON error body — keep the generic message
        }
        setErrorMessage(message);
        setStatus("error");
      })
      .catch(() => {
        if (id !== checkId.current) return;
        setErrorMessage("Could not reach the server. Please check your connection and try again.");
        setStatus("error");
      });
  }, [open, documentPath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0",
          "sm:h-[88vh] sm:w-[calc(100vw-3rem)]"
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-zinc-200 px-4 py-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <span className="truncate">{fileName || "Document preview"}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview of the attached PDF document {fileName}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex-1 bg-zinc-100">
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-500" aria-hidden />
              <p className="text-sm font-medium">Loading document…</p>
            </div>
          )}

          {status === "ready" && viewUrl && (
            <iframe
              key={viewUrl}
              src={viewUrl}
              title={`Preview of ${fileName}`}
              className="h-full w-full border-0"
            />
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <FileWarning className="h-10 w-10 text-amber-600" aria-hidden />
              <p className="max-w-md text-sm font-medium text-zinc-800">
                {errorMessage ?? "This document could not be loaded."}
              </p>
              <p className="max-w-md text-xs text-zinc-500">
                You can try downloading the file instead, or contact the administrator if the
                problem continues.
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 sm:px-5">
          <p className="hidden min-w-0 flex-1 truncate text-xs text-zinc-500 sm:block">
            {fileName}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a href={downloadUrl} download={fileName}>
              <Button type="button" variant="outline" className="min-h-11 gap-1.5">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </a>
            <a href={viewUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="outline" className="min-h-11 gap-1.5">
                <ExternalLink className="h-4 w-4" />
                Open in new tab
              </Button>
            </a>
            <Button
              type="button"
              variant="default"
              className="min-h-11"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

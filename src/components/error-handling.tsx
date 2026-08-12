"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { AlertCircle, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface AppError {
  message: string;
  fieldErrors?: Record<string, string>;
}

export function parseError(err: unknown): AppError {
  if (typeof err === "string") return { message: err };
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message);
      if (Array.isArray(parsed)) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed) {
          const field = issue.path?.length ? issue.path.join(".") : "value";
          fieldErrors[field] = issue.message;
        }
        return {
          message: Object.values(fieldErrors).join("; "),
          fieldErrors,
        };
      }
      if (parsed.issues) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.issues) {
          const field = issue.path?.length ? issue.path.join(".") : "value";
          fieldErrors[field] = issue.message;
        }
        return {
          message: Object.values(fieldErrors).join("; "),
          fieldErrors,
        };
      }
      if (parsed.message) return { message: parsed.message };
    } catch {
      // not JSON, use raw message
    }
    return { message: err.message };
  }
  return { message: "An unexpected error occurred." };
}

export function handleActionError(
  err: unknown,
  fallbackMsg = "Operation failed"
): string {
  const { message } = parseError(err);
  const display = message || fallbackMsg;
  toast.error(display);
  return display;
}

export function handleActionSuccess(msg: string) {
  toast.success(msg);
}

interface ErrorBannerProps {
  error: string | null;
  onAskAi?: (error: string) => void;
  askingAi?: boolean;
  aiResponse?: string | null;
}

export function ErrorBanner({ error, onAskAi, askingAi, aiResponse }: ErrorBannerProps) {
  const [showAi, setShowAi] = useState(false);

  if (!error) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">{error}</span>
        {onAskAi && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[10px] text-red-700 hover:bg-red-100"
            onClick={() => {
              setShowAi(!showAi);
              if (!showAi) onAskAi(error);
            }}
            disabled={askingAi}
          >
            {askingAi ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" />
            )}
            Ask AI
          </Button>
        )}
      </div>
      {showAi && aiResponse && (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
            <div className="whitespace-pre-wrap">{aiResponse}</div>
          </div>
        </div>
      )}
      {showAi && !aiResponse && !askingAi && (
        <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          No AI suggestion available. Try rephrasing or check your inputs.
        </div>
      )}
    </div>
  );
}

export function useErrorHandler() {
  const [error, setError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [askingAi, setAskingAi] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
    setAiResponse(null);
  }, []);

  const handleError = useCallback(
    (err: unknown, fallbackMsg?: string) => {
      const msg = handleActionError(err, fallbackMsg);
      setError(msg);
      setAiResponse(null);
      return msg;
    },
    []
  );

  const askAi = useCallback(async (errorMsg: string, context?: string) => {
    setAskingAi(true);
    setAiResponse(null);
    try {
      const res = await fetch("/api/ai/explain-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: errorMsg, context }),
      });
      const data = await res.json();
      if (data.success) {
        setAiResponse(data.explanation);
      } else {
        setAiResponse("Unable to get AI suggestion at this time.");
      }
    } catch {
      setAiResponse("Unable to reach AI service.");
    } finally {
      setAskingAi(false);
    }
  }, []);

  return {
    error,
    aiResponse,
    askingAi,
    setError,
    clearError,
    handleError,
    askAi,
  };
}

"use client";

import { useState } from "react";
import { generateDashboardSummary } from "@/lib/actions/ai-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

export function AiDashboardSummary() {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setSummary(null);
    const result = await generateDashboardSummary();
    if (result.success && result.data) {
      setSummary(result.data);
      toast.success("AI summary generated successfully");
    } else {
      setError(result.error ?? "Failed to generate summary");
      toast.error(result.error ?? "Failed to generate summary");
    }
    setLoading(false);
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-teal-600" />
            AI Executive Summary
          </CardTitle>
          {summary && !loading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerate}
              className="h-7 gap-1.5 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!summary && !loading && !error && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get an AI-powered executive summary analyzing all modules — financial health, priority actions, operational risks, and recommendations.
            </p>
            <Button onClick={handleGenerate} size="sm" className="gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Generate Summary
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Analyzing all modules with AI...
          </div>
        )}

        {error && !loading && (
          <div className="space-y-3">
            <ErrorBanner error={error} onAskAi={(e) => askAi(e, "AI dashboard summary")} askingAi={askingAi} aiResponse={aiResponse} />
            <Button onClick={handleGenerate} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </Button>
          </div>
        )}

        {summary && !loading && !error && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <MarkdownRenderer content={summary} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList(key: number) {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`ul-${key}`} className="my-2 space-y-1.5 pl-0">
        {listItems.map((item, i) => (
          <li key={i} className="text-sm text-foreground leading-relaxed flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
            <span><RenderInline text={item} /></span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      flushList(idx);
      const headingText = trimmed.slice(3);
      elements.push(
        <div key={idx} className="mt-4 mb-2 flex items-center gap-2">
          <div className="h-4 w-1 rounded-full bg-teal-600" />
          <h3 key={`h-${idx}`} className="text-sm font-bold text-teal-800 tracking-tight">
            {headingText}
          </h3>
        </div>
      );
    } else if (trimmed.startsWith("# ")) {
      flushList(idx);
      elements.push(
        <h2 key={idx} className="mt-3 mb-1 text-base font-bold text-foreground">
          {trimmed.slice(2)}
        </h2>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed === "") {
      flushList(idx);
    } else {
      flushList(idx);
      elements.push(
        <p key={idx} className="text-sm text-foreground leading-relaxed my-1">
          <RenderInline text={trimmed} />
        </p>
      );
    }
  });

  flushList(lines.length);

  return <>{elements}</>;
}

const severityColors: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 border border-red-300",
  HIGH: "bg-orange-100 text-orange-700 border border-orange-300",
  MEDIUM: "bg-amber-100 text-amber-700 border border-amber-300",
  LOW: "bg-teal-100 text-teal-700 border border-teal-300",
};

function RenderInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[CRITICAL\]|\[HIGH\]|\[MEDIUM\]|\[LOW\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-bold text-teal-900 bg-teal-50 px-1 rounded">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part === "[CRITICAL]" || part === "[HIGH]" || part === "[MEDIUM]" || part === "[LOW]") {
          const label = part.slice(1, -1);
          return (
            <span key={i} className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${severityColors[label]}`}>
              {label}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

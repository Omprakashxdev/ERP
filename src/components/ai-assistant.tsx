"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Send, Loader2 } from "lucide-react";
import { sendAiChatMessage } from "@/lib/actions/ai-chat";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const suggestedQuestions = [
  "What's our total billed amount?",
  "How many overdue tasks do we have?",
  "Show pending TADA claims",
  "What's our bill realization rate?",
];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!open) {
      setMessages([]);
      setInput("");
    }
  }, [open]);

  async function handleSend(text?: string) {
    const message = (text ?? input).trim();
    if (!message || loading) return;

    setInput("");
    setMessages([]);
    const userMsg: ChatMessage = { role: "user", content: message };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const result = await sendAiChatMessage(message);

    if (result.success && result.data) {
      setMessages((prev) => [...prev, { role: "assistant", content: result.data! }]);
    } else {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry, I couldn't process that. ${result.error ?? "Please try again."}` },
      ]);
    }
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating AI button — top right, below the top bar */}
      <Button
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
        className={`fixed right-4 top-16 z-30 gap-1.5 rounded-full px-3 py-1 text-xs shadow-md transition-all ${
          open ? "pointer-events-none opacity-0 translate-x-[20px]" : "opacity-100"
        }`}
        style={{ background: "linear-gradient(135deg, #0f7672, #0d6964)" }}
      >
        <span>Ask AI</span>
      </Button>

      {/* Slide-in panel — Gemini style */}
      {open && (
        <>
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[420px]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-0.5 shadow-sm overflow-hidden">
                  <img src="/saes-logo.jpg" alt="SAEC" className="h-full w-full rounded-md object-cover" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">AI Assistant</p>
                  <p className="text-[10px] text-muted-foreground">Ask about your ERP data</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white p-0.5 shadow-md overflow-hidden">
                    <img src="/saes-logo.jpg" alt="SAEC" className="h-full w-full rounded-lg object-cover" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Ask me anything</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    I can analyze your ERP data across all modules
                  </p>
                  <div className="mt-4 flex w-full flex-col gap-2">
                    {suggestedQuestions.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSend(q)}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-950/30 dark:hover:text-violet-400"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white p-0.5 overflow-hidden">
                      <img src="/saes-logo.jpg" alt="SAEC" className="h-full w-full rounded-sm object-cover" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <ChatMarkdown content={msg.content} />
                  </div>
                </div>
              ))}

              {loading && (
                <div className="mb-3 flex justify-start">
                  <div className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white p-0.5 overflow-hidden">
                    <img src="/saes-logo.jpg" alt="SAEC" className="h-full w-full rounded-sm object-cover" />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Ask about projects, bills, tasks..."
                  className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
                  style={{ maxHeight: "120px", minHeight: "40px" }}
                  disabled={loading}
                />
                <Button
                  size="sm"
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim()}
                  className="h-10 w-10 p-0"
                  style={{ background: "linear-gradient(135deg, #0f7672, #0d6964)" }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ChatMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList(key: number) {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`ul-${key}`} className="my-1 space-y-0.5 pl-3">
        {listItems.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed">
            <RenderInline text={item} />
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
      elements.push(
        <h4 key={idx} className="mt-2 mb-0.5 text-sm font-semibold">
          {trimmed.slice(3)}
        </h4>
      );
    } else if (trimmed.startsWith("# ")) {
      flushList(idx);
      elements.push(
        <h3 key={idx} className="mt-2 mb-0.5 text-sm font-semibold">
          {trimmed.slice(2)}
        </h3>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed === "") {
      flushList(idx);
    } else {
      flushList(idx);
      elements.push(
        <p key={idx} className="text-sm leading-relaxed my-0.5">
          <RenderInline text={trimmed} />
        </p>
      );
    }
  });

  flushList(lines.length);
  return <>{elements}</>;
}

function RenderInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
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
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

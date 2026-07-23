"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getNotificationRules,
  createNotificationRule,
  updateNotificationRule,
  deleteNotificationRule,
  triggerNotificationCheck,
} from "@/lib/actions/notifications";
import { Plus, Trash2, Loader2, Zap, Bell } from "lucide-react";

interface Rule {
  id: string;
  name: string;
  type: string;
  priority: string;
  module: string;
  enabled: boolean;
  thresholdDays: number;
  cronExpression: string | null;
  lastRunAt: Date | null;
}

export function NotificationsPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkLoading, setCheckLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  async function fetchRules() {
    setLoading(true);
    const res = await getNotificationRules();
    setLoading(false);
    if (res.success && res.data) {
      setRules(res.data as Rule[]);
    }
  }

  useEffect(() => {
    fetchRules();
  }, []);

  async function handleToggle(rule: Rule) {
    try {
      await updateNotificationRule({
        id: rule.id,
        enabled: !rule.enabled,
      });
      fetchRules();
    } catch (err) {
      console.error("Failed to toggle notification rule:", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteNotificationRule(id);
      fetchRules();
    } catch (err) {
      console.error("Failed to delete notification rule:", err);
    }
  }

  async function handleTriggerCheck() {
    setCheckLoading(true);
    setCheckResult(null);
    const res = await triggerNotificationCheck();
    setCheckLoading(false);
    if (res.success && res.data) {
      setCheckResult(
        `Generated ${res.data.generated} notification(s)${
          res.data.errors.length > 0
            ? ` with ${res.data.errors.length} error(s)`
            : ""
        }.`
      );
    } else {
      setCheckResult(res.error ?? "Failed to trigger check.");
    }
  }

  function priorityColor(priority: string): string {
    switch (priority) {
      case "URGENT":
        return "text-red-700 bg-red-50";
      case "HIGH":
        return "text-orange-700 bg-orange-50";
      case "MEDIUM":
        return "text-amber-700 bg-amber-50";
      default:
        return "text-zinc-600 bg-zinc-50";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-700">Notification Rules</h3>
          <p className="text-xs text-zinc-500">
            Configure automated alerts for due dates, overdue payments, pending
            replies, and document expiries.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTriggerCheck}
            disabled={checkLoading}
          >
            {checkLoading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="mr-1.5 h-3.5 w-3.5" />
            )}
            Run check
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New rule
          </Button>
        </div>
      </div>

      {checkResult && (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {checkResult}
        </div>
      )}

      {showForm && (
        <NotificationRuleForm
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            fetchRules();
          }}
        />
      )}

      <Card className="overflow-hidden shadow-sm">
        {loading ? (
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </CardContent>
        ) : rules.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-10 w-10 text-zinc-300" />
            <p className="mt-2 text-sm text-zinc-500">
              No notification rules configured. Create one to start receiving
              automated alerts.
            </p>
          </CardContent>
        ) : (
          <div className="max-h-[50vh] overflow-auto">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="whitespace-nowrap">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Type</TableHead>
                  <TableHead className="whitespace-nowrap">Priority</TableHead>
                  <TableHead className="whitespace-nowrap">Module</TableHead>
                  <TableHead className="whitespace-nowrap">Threshold</TableHead>
                  <TableHead className="whitespace-nowrap">Enabled</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {rule.type.replace(/_/g, " ").toLowerCase()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityColor(rule.priority)}`}
                      >
                        {rule.priority}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{rule.module}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {rule.thresholdDays} days
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <button
                        onClick={() => handleToggle(rule)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          rule.enabled ? "bg-emerald-500" : "bg-zinc-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            rule.enabled ? "translate-x-4.5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-zinc-400 hover:text-red-600"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function NotificationRuleForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("DUE_DATE_REMINDER");
  const [priority, setPriority] = useState("MEDIUM");
  const [module, setModule] = useState("paymentSchedules");
  const [thresholdDays, setThresholdDays] = useState("7");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await createNotificationRule({
        name,
        type: type as never,
        priority: priority as never,
        module,
        thresholdDays: Number(thresholdDays),
        enabled: true,
      });

      if (res.success) {
        onCreated();
      } else {
        setError(res.error ?? "Failed to create rule.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-3 p-4">
        <h4 className="text-sm font-medium">New notification rule</h4>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Payment due reminder"
                className="h-8 w-full rounded-md border border-zinc-200 px-3 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200 px-3 text-xs"
              >
                <option value="DUE_DATE_REMINDER">Due date reminder</option>
                <option value="OVERDUE_PAYMENT">Overdue payment</option>
                <option value="PENDING_REPLY">Pending reply</option>
                <option value="VEHICLE_DOC_EXPIRY">Vehicle doc expiry</option>
                <option value="DOCUMENT_EXPIRY">Document expiry</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200 px-3 text-xs"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">Module</label>
              <input
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200 px-3 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">
                Threshold (days)
              </label>
              <input
                type="number"
                value={thresholdDays}
                onChange={(e) => setThresholdDays(e.target.value)}
                min={1}
                max={365}
                className="h-8 w-full rounded-md border border-zinc-200 px-3 text-xs"
                required
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create rule
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

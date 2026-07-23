"use client";

import { useEffect, useState } from "react";
import { getSmartAlerts, SmartAlert } from "@/lib/actions/smart-alerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ShieldAlert, Info, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const severityConfig = {
  CRITICAL: {
    icon: ShieldAlert,
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-900",
    badge: "destructive" as const,
  },
  HIGH: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-900",
    badge: "secondary" as const,
  },
  MEDIUM: {
    icon: Info,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-900",
    badge: "secondary" as const,
  },
  LOW: {
    icon: Info,
    color: "text-zinc-500",
    bg: "bg-zinc-50 dark:bg-zinc-900/30",
    border: "border-zinc-200 dark:border-zinc-800",
    badge: "secondary" as const,
  },
};

export function SmartAlerts() {
  const [alerts, setAlerts] = useState<SmartAlert[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const result = await getSmartAlerts();
      if (cancelled) return;
      if (result.success && result.data) {
        setAlerts(result.data);
      } else {
        setError(result.error ?? "Failed to load alerts");
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Smart Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scanning for anomalies...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Smart Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Unable to load alerts: {error}
        </CardContent>
      </Card>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <Card className="shadow-sm border-emerald-200 dark:border-emerald-900">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Smart Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            All clear — no anomalies detected across modules.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Smart Alerts
          <Badge variant="secondary" className="ml-1 text-xs">
            {alerts.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((alert) => {
          const config = severityConfig[alert.severity];
          const Icon = config.icon;
          return (
            <Link
              key={alert.id}
              href={alert.href}
              className={`block rounded-lg border ${config.border} ${config.bg} p-3 transition-shadow hover:shadow-md`}
            >
              <div className="flex items-start gap-2.5">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.color}`} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {alert.title}
                    </p>
                    <Badge variant={config.badge} className="text-[10px] px-1.5 py-0">
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {alert.description}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {alert.category}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

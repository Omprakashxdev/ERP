"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAuditLogs, getAuditLogStats } from "@/lib/actions/audit-log";
import { Search, Loader2, Shield, ChevronLeft, ChevronRight } from "lucide-react";

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; email: string; role: string } | null;
}

interface Stats {
  totalEvents: number;
  eventsByAction: Record<string, number>;
  eventsByEntity: Record<string, number>;
  recentUsers: { id: string; name: string | null; email: string; count: number }[];
}

export function AuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const pageSize = 25;

  async function fetchData(p: number, s: string) {
    setLoading(true);
    const [logsRes, statsRes] = await Promise.all([
      getAuditLogs(
        s.trim() ? { search: s.trim() } : undefined,
        p,
        pageSize
      ),
      getAuditLogStats(),
    ]);
    setLoading(false);

    if (logsRes.success && logsRes.data) {
      setRows(logsRes.data.rows as AuditRow[]);
      setTotal(logsRes.data.total);
    }
    if (statsRes.success && statsRes.data) {
      setStats(statsRes.data as Stats);
    }
  }

  useEffect(() => {
    fetchData(page, search);
  }, [page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchData(1, search);
  }

  const totalPages = Math.ceil(total / pageSize);

  function actionColor(action: string): string {
    switch (action) {
      case "create":
        return "text-emerald-700 bg-emerald-50";
      case "update":
        return "text-blue-700 bg-blue-50";
      case "delete":
        return "text-red-700 bg-red-50";
      case "export":
        return "text-purple-700 bg-purple-50";
      case "import":
        return "text-purple-700 bg-purple-50";
      case "trigger":
        return "text-amber-700 bg-amber-50";
      default:
        return "text-zinc-600 bg-zinc-50";
    }
  }

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <p className="text-xs text-zinc-500">Total events</p>
              <p className="text-xl font-semibold">{stats.totalEvents}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <p className="text-xs text-zinc-500">Actions tracked</p>
              <p className="text-xl font-semibold">
                {Object.keys(stats.eventsByAction).length}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <p className="text-xs text-zinc-500">Entities tracked</p>
              <p className="text-xl font-semibold">
                {Object.keys(stats.eventsByEntity).length}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search by action, entity, user…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      <Card className="overflow-hidden shadow-sm">
        {loading ? (
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </CardContent>
        ) : rows.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="h-10 w-10 text-zinc-300" />
            <p className="mt-2 text-sm text-zinc-500">No audit logs found.</p>
          </CardContent>
        ) : (
          <div className="max-h-[50vh] overflow-auto">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead className="whitespace-nowrap">User</TableHead>
                  <TableHead className="whitespace-nowrap">Action</TableHead>
                  <TableHead className="whitespace-nowrap">Entity</TableHead>
                  <TableHead className="whitespace-nowrap">Entity ID</TableHead>
                  <TableHead className="whitespace-nowrap">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-zinc-500">
                      {new Date(row.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.user ? (
                        <div>
                          <span className="font-medium">
                            {row.user.name ?? row.user.email}
                          </span>
                          <span className="ml-1 text-[10px] text-zinc-400">
                            ({row.user.role})
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-400">System</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${actionColor(row.action)}`}
                      >
                        {row.action}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.entity}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-[10px] text-zinc-400">
                      {row.entityId ? row.entityId.slice(0, 12) + "…" : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-zinc-400">
                      {row.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

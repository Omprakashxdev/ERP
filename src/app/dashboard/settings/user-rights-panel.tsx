"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Check, X, Lock, Loader2, Save } from "lucide-react";
import {
  getAllPermissions,
  updatePermission,
  getAiAllowedRoles,
  updateAiAllowedRoles,
  getAiDataAccessMatrix,
  updateAiDataAccess,
} from "@/lib/actions/permissions";

const modules = [
  { key: "fundFlow", label: "Fund Flow" },
  { key: "dueBills", label: "Due Bills" },
  { key: "wip", label: "Work in Progress" },
  { key: "contractors", label: "Contractors" },
  { key: "tenders", label: "Tenders" },
  { key: "paymentSchedules", label: "Payment Schedules" },
  { key: "vehicleLogBook", label: "Vehicle Log Book" },
  { key: "assets", label: "Assets" },
  { key: "inOutRegister", label: "In-Out Register" },
  { key: "tadaBills", label: "TADA Bills" },
  { key: "taskManagement", label: "Tasks" },
  { key: "reports", label: "Reports" },
  { key: "exportImport", label: "Export / Import" },
  { key: "notifications", label: "Notifications" },
  { key: "auditLog", label: "Audit Log" },
  { key: "userManagement", label: "User Management" },
];

const roles = ["ADMIN", "MANAGER", "STAFF", "AUDITOR"] as const;
const actions = ["create", "read", "update", "delete"] as const;

const roleConfig: Record<string, { label: string; color: string }> = {
  ADMIN: { label: "Admin", color: "text-purple-700 bg-purple-50" },
  MANAGER: { label: "Manager", color: "text-blue-700 bg-blue-50" },
  STAFF: { label: "Staff", color: "text-zinc-600 bg-zinc-50" },
  AUDITOR: { label: "Auditor", color: "text-amber-700 bg-amber-50" },
};

export function UserRightsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [permissions, setPermissions] = useState<Record<string, Record<string, string[]>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [aiRoles, setAiRoles] = useState<string[]>(["ADMIN", "MANAGER", "STAFF", "AUDITOR"]);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiDataMatrix, setAiDataMatrix] = useState<Record<string, string[]>>({});
  const [aiDataSaving, setAiDataSaving] = useState(false);

  const aiDataModules = [
    { key: "projects", label: "Projects" },
    { key: "dueBills", label: "Due Bills" },
    { key: "fundFlow", label: "Fund Flow" },
    { key: "tadaClaims", label: "TADA Claims" },
    { key: "tenders", label: "Tenders" },
    { key: "tasks", label: "Tasks" },
    { key: "vehicles", label: "Vehicles" },
    { key: "paymentSchedules", label: "Payment Schedules" },
    { key: "contractors", label: "Contractors" },
  ];

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    const [permRes, aiRes, dataRes] = await Promise.all([
      getAllPermissions(),
      getAiAllowedRoles(),
      getAiDataAccessMatrix(),
    ]);
    if (permRes.success && permRes.data) setPermissions(permRes.data);
    if (aiRes.success && aiRes.data) setAiRoles(aiRes.data);
    if (dataRes.success && dataRes.data) setAiDataMatrix(dataRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  function togglePermission(resource: string, role: string, action: string) {
    if (role === "ADMIN") return;
    setPermissions((prev) => {
      const current = prev[resource]?.[role] ?? [];
      const next = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      return {
        ...prev,
        [resource]: { ...prev[resource], [role]: next },
      };
    });
  }

  async function savePermission(resource: string, role: string) {
    setSaving(`${resource}:${role}`);
    try {
      const acts = permissions[resource]?.[role] ?? [];
      await updatePermission(resource, role, acts);
    } catch (err) {
      console.error("Failed to save permission:", err);
    } finally {
      setSaving(null);
    }
  }

  function toggleAiRole(role: string) {
    setAiRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function saveAiRoles() {
    setAiSaving(true);
    try {
      await updateAiAllowedRoles(aiRoles);
    } catch (err) {
      console.error("Failed to save AI roles:", err);
    } finally {
      setAiSaving(false);
    }
  }

  function toggleAiDataModule(role: string, moduleKey: string) {
    if (role === "ADMIN") return;
    setAiDataMatrix((prev) => {
      const current = prev[role] ?? [];
      const next = current.includes(moduleKey)
        ? current.filter((m) => m !== moduleKey)
        : [...current, moduleKey];
      return { ...prev, [role]: next };
    });
  }

  async function saveAiDataMatrix() {
    setAiDataSaving(true);
    try {
      await updateAiDataAccess(aiDataMatrix);
    } catch (err) {
      console.error("Failed to save AI data matrix:", err);
    } finally {
      setAiDataSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Permission Matrix */}
      <div className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Shield className="h-4 w-4" />
            User Rights & Permissions
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {isAdmin
              ? "Click toggles to edit permissions for each role. Admin always has full access."
              : "View what each role can do across all modules. Admin always has full access."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <Badge key={role} variant="secondary" className={`text-xs ${roleConfig[role].color}`}>
              {roleConfig[role].label}
            </Badge>
          ))}
        </div>

        <Card className="overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
                <tr className="border-b">
                  <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-zinc-700 dark:text-zinc-300">
                    Module
                  </th>
                  {roles.map((role) => (
                    <th
                      key={role}
                      className="whitespace-nowrap px-3 py-2.5 text-center font-semibold text-zinc-700 dark:text-zinc-300"
                    >
                      {roleConfig[role].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => (
                  <tr
                    key={mod.key}
                    className="border-b last:border-0 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">
                      {mod.label}
                    </td>
                    {roles.map((role) => {
                      const perms = permissions[mod.key]?.[role] ?? [];
                      const isLocked = role === "ADMIN";
                      const cellKey = `${mod.key}:${role}`;
                      return (
                        <td key={role} className="px-3 py-2.5">
                          <div className="flex flex-wrap justify-center gap-1">
                            {actions.map((action) => {
                              const has = isLocked || perms.includes(action);
                              const canToggle = isAdmin && !isLocked;
                              return (
                                <button
                                  key={action}
                                  disabled={!canToggle}
                                  onClick={() => togglePermission(mod.key, role, action)}
                                  className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${
                                    has
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                                  } ${
                                    canToggle
                                      ? "cursor-pointer hover:scale-105 hover:shadow-sm"
                                      : "cursor-default"
                                  }`}
                                  title={has ? `Can ${action}` : `Cannot ${action}`}
                                >
                                  {has ? (
                                    <Check className="h-2.5 w-2.5" />
                                  ) : (
                                    <X className="h-2.5 w-2.5" />
                                  )}
                                  {action}
                                </button>
                              );
                            })}
                            {isLocked && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950/30 dark:text-purple-400">
                                <Lock className="h-2.5 w-2.5" />
                                admin
                              </span>
                            )}
                            {isAdmin && !isLocked && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                disabled={saving === cellKey}
                                onClick={() => savePermission(mod.key, role)}
                                title="Save changes"
                              >
                                {saving === cellKey ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3 text-emerald-600" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* AI Access Control */}
      <div className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Shield className="h-4 w-4 text-violet-500" />
            AI Assistant Access Control
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {isAdmin
              ? "Control which roles can use the AI assistant. Toggle roles on/off and save."
              : "View which roles have access to the AI assistant."}
          </p>
        </div>

        <Card className="shadow-sm">
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {roles.map((role) => {
                const enabled = aiRoles.includes(role);
                const canToggle = isAdmin;
                return (
                  <button
                    key={role}
                    disabled={!canToggle}
                    onClick={() => toggleAiRole(role)}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-all ${
                      enabled
                        ? "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30"
                        : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                    } ${
                      canToggle
                        ? "cursor-pointer hover:scale-105 hover:shadow-sm"
                        : "cursor-default opacity-80"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        enabled
                          ? "bg-violet-500 text-white"
                          : "bg-zinc-300 text-zinc-500 dark:bg-zinc-700"
                      }`}
                    >
                      {enabled ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </div>
                    <span className={`text-xs font-medium ${roleConfig[role].color} rounded px-2 py-0.5`}>
                      {roleConfig[role].label}
                    </span>
                  </button>
                );
              })}
            </div>

            {isAdmin && (
              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  onClick={saveAiRoles}
                  disabled={aiSaving}
                  className="gap-2"
                >
                  {aiSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save AI Access
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* AI Data Access Control */}
      <div className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Shield className="h-4 w-4 text-rose-500" />
            AI Data Access Control
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {isAdmin
              ? "Control which ERP data modules the AI can access per role. If a module is disabled, the AI will not load or answer questions about that data for that role."
              : "View which ERP data modules the AI can access per role."}
          </p>
        </div>

        <Card className="overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
                <tr className="border-b">
                  <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-zinc-700 dark:text-zinc-300">
                    Data Module
                  </th>
                  {roles.map((role) => (
                    <th
                      key={role}
                      className="whitespace-nowrap px-3 py-2.5 text-center font-semibold text-zinc-700 dark:text-zinc-300"
                    >
                      {roleConfig[role].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aiDataModules.map((mod) => (
                  <tr
                    key={mod.key}
                    className="border-b last:border-0 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">
                      {mod.label}
                    </td>
                    {roles.map((role) => {
                      const enabled = role === "ADMIN" || (aiDataMatrix[role] ?? []).includes(mod.key);
                      const isLocked = role === "ADMIN";
                      const canToggle = isAdmin && !isLocked;
                      return (
                        <td key={role} className="px-3 py-2.5 text-center">
                          <button
                            disabled={!canToggle}
                            onClick={() => toggleAiDataModule(role, mod.key)}
                            className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                              enabled
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                            } ${
                              canToggle
                                ? "cursor-pointer hover:scale-105 hover:shadow-sm"
                                : "cursor-default"
                            }`}
                            title={enabled ? "AI can access" : "AI cannot access"}
                          >
                            {enabled ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isAdmin && (
            <div className="flex justify-end border-t p-3">
              <Button
                size="sm"
                onClick={saveAiDataMatrix}
                disabled={aiDataSaving}
                className="gap-2"
              >
                {aiDataSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Data Access
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* TADA bills note */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400">
        <p className="font-medium">TADA Bills Approval Rule</p>
        <p className="mt-0.5">
          All roles (Staff, Manager, Auditor, Admin) can create and submit TADA bill requests.
          Only Admins can approve, reject, verify, or mark bills as paid.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getUsers,
  updateUserRole,
  toggleUserActive,
} from "@/lib/actions/audit-log";
import {
  createUser,
  getPendingRegistrations,
  approveRegistration,
  rejectRegistration,
  getRegionsForForm,
  getStaffForForm,
} from "@/lib/actions/user-management";
import {
  Users,
  Loader2,
  UserCheck,
  UserX,
  UserPlus,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

interface RegistrationRow {
  id: string;
  name: string;
  email: string;
  employeeCode: string | null;
  designation: string | null;
  region: { name: string } | null;
  reportingManager: { name: string; designation: string | null } | null;
  createdAt: Date;
}

interface RegionOption {
  id: string;
  name: string;
}

interface StaffOption {
  id: string;
  name: string;
  designation: string | null;
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RegistrationRow | null>(null);

  const [cuName, setCuName] = useState("");
  const [cuEmail, setCuEmail] = useState("");
  const [cuPassword, setCuPassword] = useState("");
  const [cuRole, setCuRole] = useState("STAFF");
  const [cuEmployeeCode, setCuEmployeeCode] = useState("");
  const [cuDesignation, setCuDesignation] = useState("");
  const [cuRegionId, setCuRegionId] = useState("");
  const [cuManagerId, setCuManagerId] = useState("");
  const [cuLoading, setCuLoading] = useState(false);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [usersRes, regRes, regionsRes, staffRes] = await Promise.all([
      getUsers(),
      getPendingRegistrations(),
      getRegionsForForm(),
      getStaffForForm(),
    ]);
    if (usersRes.success && usersRes.data) setUsers(usersRes.data as UserRow[]);
    if (regRes.success && regRes.data) setRegistrations(regRes.data as RegistrationRow[]);
    if (regionsRes.success && regionsRes.data) setRegions(regionsRes.data as RegionOption[]);
    if (staffRes.success && staffRes.data) setStaff(staffRes.data as StaffOption[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleRoleChange(userId: string, newRole: string) {
    setActionLoading(`role-${userId}`);
    try {
      await updateUserRole(userId, newRole as "ADMIN" | "MANAGER" | "STAFF" | "AUDITOR");
      fetchAll();
    } catch {
      toast.error("Failed to update role");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleActive(userId: string) {
    setActionLoading(`toggle-${userId}`);
    try {
      await toggleUserActive(userId);
      fetchAll();
    } catch {
      toast.error("Failed to toggle user status");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCuLoading(true);
    try {
      const res = await createUser({
        name: cuName,
        email: cuEmail,
        password: cuPassword,
        role: cuRole as "ADMIN" | "MANAGER" | "STAFF" | "AUDITOR",
        employeeCode: cuEmployeeCode || undefined,
        designation: cuDesignation || undefined,
        regionId: cuRegionId || undefined,
        reportingManagerId: cuManagerId || undefined,
      });
      if (res.success) {
        toast.success("User created successfully");
        setCreateOpen(false);
        setCuName(""); setCuEmail(""); setCuPassword(""); setCuRole("STAFF");
        setCuEmployeeCode(""); setCuDesignation(""); setCuRegionId(""); setCuManagerId("");
        fetchAll();
      } else {
        toast.error(res.error ?? "Failed to create user");
      }
    } catch {
      toast.error("Failed to create user");
    } finally {
      setCuLoading(false);
    }
  }

  async function handleApprove(regId: string, role: string = "STAFF") {
    setActionLoading(`approve-${regId}`);
    try {
      const res = await approveRegistration(regId, role as "ADMIN" | "MANAGER" | "STAFF" | "AUDITOR");
      if (res.success) {
        toast.success("Registration approved — user account created");
        fetchAll();
      } else {
        toast.error(res.error ?? "Failed to approve registration");
      }
    } catch {
      toast.error("Failed to approve registration");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    setRejectLoading(true);
    try {
      const res = await rejectRegistration(rejectTarget.id, rejectReason || undefined);
      if (res.success) {
        toast.success("Registration rejected");
        setRejectTarget(null);
        setRejectReason("");
        fetchAll();
      } else {
        toast.error(res.error ?? "Failed to reject registration");
      }
    } catch {
      toast.error("Failed to reject registration");
    } finally {
      setRejectLoading(false);
    }
  }

  function roleColor(role: string): string {
    switch (role) {
      case "ADMIN": return "text-purple-700 bg-purple-50";
      case "MANAGER": return "text-blue-700 bg-blue-50";
      case "STAFF": return "text-zinc-600 bg-zinc-50";
      case "AUDITOR": return "text-amber-700 bg-amber-50";
      default: return "text-zinc-600 bg-zinc-50";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-700">User Management</h3>
          <p className="text-xs text-zinc-500">
            Manage user accounts, roles, and registration approvals.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Create User
        </Button>
      </div>

      {registrations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <h4 className="text-sm font-medium text-amber-700">
              Pending Registration Approvals ({registrations.length})
            </h4>
          </div>
          <Card className="overflow-hidden border-amber-200 shadow-sm">
            <div className="max-h-[40vh] overflow-auto">
              <Table className="text-xs">
                <TableHeader className="sticky top-0 z-10 bg-white">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="whitespace-nowrap">Name</TableHead>
                    <TableHead className="whitespace-nowrap">Email</TableHead>
                    <TableHead className="whitespace-nowrap">Emp Code</TableHead>
                    <TableHead className="whitespace-nowrap">Designation</TableHead>
                    <TableHead className="whitespace-nowrap">Region</TableHead>
                    <TableHead className="whitespace-nowrap">Reporting To</TableHead>
                    <TableHead className="whitespace-nowrap">Requested</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell className="font-medium">{reg.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{reg.email}</TableCell>
                      <TableCell className="whitespace-nowrap">{reg.employeeCode ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{reg.designation ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{reg.region?.name ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {reg.reportingManager?.name ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-zinc-400">
                        {new Date(reg.createdAt).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 p-0"
                            onClick={() => handleApprove(reg.id, "STAFF")}
                            disabled={actionLoading === `approve-${reg.id}`}
                            title="Approve as Staff"
                          >
                            {actionLoading === `approve-${reg.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 p-0"
                            onClick={() => setRejectTarget(reg)}
                            title="Reject"
                          >
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden shadow-sm">
        {loading ? (
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </CardContent>
        ) : users.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-zinc-300" />
            <p className="mt-2 text-sm text-zinc-500">No users found.</p>
          </CardContent>
        ) : (
          <div className="max-h-[50vh] overflow-auto">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="whitespace-nowrap">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  <TableHead className="whitespace-nowrap">Role</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Last login</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{user.email}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Select
                        value={user.role}
                        onValueChange={(v) => handleRoleChange(user.id, v ?? user.role)}
                      >
                        <SelectTrigger className="h-7 w-28" size="sm">
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${roleColor(user.role)}`}>
                            {user.role}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="MANAGER">Manager</SelectItem>
                          <SelectItem value="STAFF">Staff</SelectItem>
                          <SelectItem value="AUDITOR">Auditor</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={user.isActive ? "secondary" : "outline"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-zinc-400">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString("en-IN")
                        : "Never"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 p-0"
                        onClick={() => handleToggleActive(user.id)}
                        disabled={actionLoading === `toggle-${user.id}`}
                        title={user.isActive ? "Deactivate user" : "Activate user"}
                      >
                        {actionLoading === `toggle-${user.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : user.isActive ? (
                          <UserX className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {createOpen && (
        <Dialog open onOpenChange={(open) => !open && setCreateOpen(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Create a user account and staff profile. The user will be able to log in immediately.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Full Name *</Label>
                  <Input value={cuName} onChange={(e) => setCuName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={cuEmail} onChange={(e) => setCuEmail(e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Password *</Label>
                  <Input type="password" value={cuPassword} onChange={(e) => setCuPassword(e.target.value)} required minLength={8} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Select value={cuRole} onValueChange={(v) => setCuRole(v ?? "STAFF")}>
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="MANAGER">Manager</SelectItem>
                      <SelectItem value="STAFF">Staff</SelectItem>
                      <SelectItem value="AUDITOR">Auditor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Employee Code</Label>
                  <Input value={cuEmployeeCode} onChange={(e) => setCuEmployeeCode(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Designation</Label>
                  <Input value={cuDesignation} onChange={(e) => setCuDesignation(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Region</Label>
                  <Select value={cuRegionId} onValueChange={(v) => setCuRegionId(v ?? "")}>
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reporting Manager</Label>
                  <Select value={cuManagerId} onValueChange={(v) => setCuManagerId(v ?? "")}>
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}{s.designation ? ` (${s.designation})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={cuLoading}>
                  {cuLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Create User
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {rejectTarget && (
        <Dialog open onOpenChange={(open) => !open && setRejectTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reject Registration</DialogTitle>
              <DialogDescription>
                Reject registration request from {rejectTarget.name} ({rejectTarget.email})
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleReject} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setRejectTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" size="sm" disabled={rejectLoading}>
                  {rejectLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Reject
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

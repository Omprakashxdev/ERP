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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getUsers, updateUserRole, toggleUserActive } from "@/lib/actions/audit-log";
import { Users, Loader2, UserCheck, UserX } from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function fetchUsers() {
    setLoading(true);
    const res = await getUsers();
    setLoading(false);
    if (res.success && res.data) {
      setUsers(res.data as UserRow[]);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleRoleChange(userId: string, newRole: string) {
    setActionLoading(`role-${userId}`);
    try {
      await updateUserRole(userId, newRole as "ADMIN" | "MANAGER" | "STAFF" | "AUDITOR");
      fetchUsers();
    } catch (err) {
      console.error("Failed to update role:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleActive(userId: string) {
    setActionLoading(`toggle-${userId}`);
    try {
      await toggleUserActive(userId);
      fetchUsers();
    } catch (err) {
      console.error("Failed to toggle user:", err);
    } finally {
      setActionLoading(null);
    }
  }

  function roleColor(role: string): string {
    switch (role) {
      case "ADMIN":
        return "text-purple-700 bg-purple-50";
      case "MANAGER":
        return "text-blue-700 bg-blue-50";
      case "STAFF":
        return "text-zinc-600 bg-zinc-50";
      case "AUDITOR":
        return "text-amber-700 bg-amber-50";
      default:
        return "text-zinc-600 bg-zinc-50";
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-zinc-700">User Management</h3>
        <p className="text-xs text-zinc-500">
          Manage user roles and active status. Only admins can access this panel.
        </p>
      </div>

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
                    <TableCell className="font-medium">
                      {user.name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{user.email}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Select
                        value={user.role}
                        onValueChange={(v) => handleRoleChange(user.id, v ?? user.role)}
                      >
                        <SelectTrigger className="h-7 w-28" size="sm">
                          <span
                            className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${roleColor(user.role)}`}
                          >
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
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Staff, Region } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStaff, updateStaff } from "@/lib/actions/staff";
import { Plus, Pencil, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

interface StaffTableProps {
  staff: (Staff & { region?: Region | null; reportingManager?: { id: string; name: string; designation: string | null } | null })[];
  regions: Region[];
  canManage: boolean;
}

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

export function StaffTable({ staff, regions, canManage }: StaffTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<(Staff & { region?: Region | null; reportingManager?: { id: string; name: string; designation: string | null } | null }) | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = staff.filter((s) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term) ||
      s.employeeCode?.toLowerCase().includes(term) ||
      s.designation?.toLowerCase().includes(term) ||
      s.phone?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff…"
            className="pl-8"
          />
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Staff
          </Button>
        )}
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-md border">
        <Table className="text-sm">
          <TableHeader className="sticky top-0 bg-white">
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Emp Code</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 8 : 7} className="py-8 text-center text-zinc-400">
                  No staff found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.employeeCode ?? "—"}</TableCell>
                  <TableCell>{s.designation ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.email ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.phone ?? "—"}</TableCell>
                  <TableCell>{s.region?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={s.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-600 border-zinc-200"}
                    >
                      {s.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setSelectedStaff(s)}
                        title="Edit staff"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedStaff && (
        <StaffFormDialog
          staff={selectedStaff}
          allStaff={staff}
          regions={regions}
          mode="edit"
          onClose={() => setSelectedStaff(null)}
        />
      )}

      {createOpen && (
        <StaffFormDialog
          allStaff={staff}
          regions={regions}
          mode="create"
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function StaffFormDialog({
  staff,
  allStaff,
  regions,
  mode,
  onClose,
}: {
  staff?: Staff & { region?: Region | null; reportingManager?: { id: string; name: string; designation: string | null } | null };
  allStaff: (Staff & { region?: Region | null; reportingManager?: { id: string; name: string; designation: string | null } | null })[];
  regions: Region[];
  mode: "create" | "edit";
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

  const [form, setForm] = useState({
    name: staff?.name ?? "",
    email: staff?.email ?? "",
    phone: staff?.phone ?? "",
    employeeCode: staff?.employeeCode ?? "",
    designation: staff?.designation ?? "",
    regionId: staff?.regionId ?? "",
    reportingManagerId: staff?.reportingManagerId ?? "",
    isActive: staff?.isActive ?? true,
  });

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      email: emptyToNull(form.email),
      phone: emptyToNull(form.phone),
      employeeCode: emptyToNull(form.employeeCode),
      designation: emptyToNull(form.designation),
      regionId: form.regionId || undefined,
      reportingManagerId: form.reportingManagerId || undefined,
      isActive: form.isActive,
    };

    try {
      const res = isEdit
        ? await updateStaff({ id: staff!.id, ...payload } as never)
        : await createStaff(payload as never);

      if (!res.success) {
        setError(res.error ?? "Failed to save staff");
        toast.error(res.error ?? "Failed to save staff");
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
      return;
    } finally {
      setSubmitting(false);
    }

    toast.success(mode === "create" ? "Staff member created successfully" : "Staff member updated successfully");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Staff" : "New Staff"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update staff details" : "Add a new staff member"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              required
              placeholder="Full name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Employee Code</Label>
              <Input
                value={form.employeeCode}
                onChange={(e) => updateField("employeeCode", e.target.value)}
                placeholder="Auto-generated"
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input
                value={form.designation}
                onChange={(e) => updateField("designation", e.target.value)}
                placeholder="e.g. Engineer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="Phone number"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Region</Label>
              <Select
                value={form.regionId}
                onValueChange={(v) => updateField("regionId", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select region">
                    {(value: string) =>
                      regions.find((r) => r.id === value)?.name ?? "Select region"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.isActive ? "true" : "false"}
                onValueChange={(v) => updateField("isActive", v === "true")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status">
                    {(value: string) => (value === "true" ? "Active" : "Inactive")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Reporting Manager</Label>
            <Select
              value={form.reportingManagerId}
              onValueChange={(v) => updateField("reportingManagerId", v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reporting manager">
                  {(value: string) =>
                    allStaff.find((s) => s.id === value)?.name ?? "Select reporting manager"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allStaff
                  .filter((s) => s.id !== staff?.id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.designation ? ` (${s.designation})` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating staff member" : "Editing staff member")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Staff"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

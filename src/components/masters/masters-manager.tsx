"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import {
  getMasterList,
  createMaster,
  updateMaster,
  deleteMaster,
  type MasterType,
} from "@/lib/actions/masters";

interface MasterItem {
  id: string;
  name?: string;
  referenceNumber?: string;
  url?: string;
  phone?: string;
  email?: string;
  address?: string;
  stateId?: string;
  makeId?: string;
  state?: { id: string; name: string };
  make?: { id: string; name: string };
  createdAt?: string;
}

interface MasterConfig {
  type: MasterType;
  label: string;
  singularLabel: string;
  field: "name" | "referenceNumber";
  hasUrl?: boolean;
  hasState?: boolean;
  hasMake?: boolean;
  hasContact?: boolean;
}

const MASTER_CONFIGS: MasterConfig[] = [
  { type: "region", label: "Regions", singularLabel: "Region", field: "name" },
  { type: "department", label: "Departments", singularLabel: "Department", field: "name" },
  { type: "designation", label: "Designations", singularLabel: "Designation", field: "name" },
  { type: "state", label: "States", singularLabel: "State", field: "name" },
  { type: "city", label: "Cities", singularLabel: "City", field: "name", hasState: true },
  { type: "platform", label: "Platforms", singularLabel: "Platform", field: "name", hasUrl: true },
  { type: "paymentType", label: "Payment Types", singularLabel: "Payment Type", field: "name" },
  { type: "assetCategory", label: "Asset Categories", singularLabel: "Asset Category", field: "name" },
  { type: "assetMake", label: "Asset Makes", singularLabel: "Asset Make", field: "name" },
  { type: "assetModel", label: "Asset Models", singularLabel: "Asset Model", field: "name", hasMake: true },
  { type: "orderMaster", label: "Order Master", singularLabel: "Order", field: "name" },
  { type: "workMaster", label: "Work Master", singularLabel: "Work", field: "name" },
  { type: "typeMaster", label: "Type Master", singularLabel: "Type (e.g. PMC, TPI)", field: "name" },
  { type: "dprMaster", label: "DPR Master", singularLabel: "DPR Reference", field: "referenceNumber" },
  { type: "tsAaMaster", label: "TS/AA Master", singularLabel: "TS/AA Reference", field: "referenceNumber" },
  { type: "workOrderMaster", label: "Work Order Master", singularLabel: "Work Order", field: "name" },
  { type: "drawingMaster", label: "Drawing Master", singularLabel: "Drawing", field: "name" },
  { type: "contactMaster", label: "Contact Master", singularLabel: "Contact", field: "name", hasContact: true },
];

export function MastersManager() {
  const [activeType, setActiveType] = useState<MasterType>("department");
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [formValue, setFormValue] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formStateId, setFormStateId] = useState("");
  const [formMakeId, setFormMakeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();
  const [states, setStates] = useState<{ id: string; name: string }[]>([]);
  const [makes, setMakes] = useState<{ id: string; name: string }[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<MasterItem | null>(null);

  const activeConfig = MASTER_CONFIGS.find((c) => c.type === activeType)!;

  const loadItems = useCallback(async () => {
    setLoading(true);
    const res = await getMasterList(activeType, search || undefined);
    if (res.success && res.data) {
      setItems(res.data as MasterItem[]);
    }
    setLoading(false);
  }, [activeType, search]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Load states/makes when needed
  useEffect(() => {
    if (activeConfig.hasState) {
      getMasterList("state").then((res) => {
        if (res.success && res.data) setStates(res.data as { id: string; name: string }[]);
      });
    }
    if (activeConfig.hasMake) {
      getMasterList("assetMake").then((res) => {
        if (res.success && res.data) setMakes(res.data as { id: string; name: string }[]);
      });
    }
  }, [activeType, activeConfig.hasState, activeConfig.hasMake]);

  function openCreate() {
    setEditing(null);
    setFormValue("");
    setFormUrl("");
    setFormPhone("");
    setFormEmail("");
    setFormAddress("");
    setFormStateId("");
    setFormMakeId("");
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(item: MasterItem) {
    setEditing(item);
    setFormValue(
      activeConfig.field === "referenceNumber"
        ? item.referenceNumber ?? ""
        : item.name ?? ""
    );
    setFormUrl(item.url ?? "");
    setFormPhone(item.phone ?? "");
    setFormEmail(item.email ?? "");
    setFormAddress(item.address ?? "");
    setFormStateId(item.stateId ?? "");
    setFormMakeId(item.makeId ?? "");
    setError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const input: Record<string, unknown> = {};
      if (activeConfig.field === "referenceNumber") {
        input.referenceNumber = formValue;
      } else {
        input.name = formValue;
      }
      if (activeConfig.hasUrl) input.url = formUrl || undefined;
      if (activeConfig.hasContact) {
        input.phone = formPhone || undefined;
        input.email = formEmail || undefined;
        input.address = formAddress || undefined;
      }
      if (activeConfig.hasState) input.stateId = formStateId || undefined;
      if (activeConfig.hasMake) input.makeId = formMakeId || undefined;

      if (editing) {
        input.id = editing.id;
        const res = await updateMaster(activeType, input);
        if (!res.success) {
          setError(res.error ?? "Failed to update");
          toast.error(res.error ?? "Failed to update");
          setSubmitting(false);
          return;
        }
      } else {
        const res = await createMaster(activeType, input);
        if (!res.success) {
          setError(res.error ?? "Failed to create");
          toast.error(res.error ?? "Failed to create");
          setSubmitting(false);
          return;
        }
      }
      toast.success(editing ? "Updated successfully" : "Created successfully");
      setDialogOpen(false);
      loadItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      setError(msg);
      toast.error(msg);
    }
    setSubmitting(false);
  }

  async function handleDelete(item: MasterItem) {
    setSubmitting(true);
    setError(null);
    const res = await deleteMaster(activeType, item.id);
    if (!res.success) {
      setError(res.error ?? "Failed to delete");
      toast.error(res.error ?? "Failed to delete");
    } else {
      toast.success("Deleted successfully");
    }
    setDeleteConfirm(null);
    setSubmitting(false);
    loadItems();
  }

  function getDisplayValue(item: MasterItem): string {
    if (activeConfig.field === "referenceNumber") return item.referenceNumber ?? "";
    return item.name ?? "";
  }

  return (
    <div className="space-y-4">
      {/* Master type tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-lg border bg-zinc-50/50 p-1.5">
        {MASTER_CONFIGS.map((config) => (
          <button
            key={config.type}
            onClick={() => {
              setActiveType(config.type);
              setSearch("");
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeType === config.type
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:bg-white/50 hover:text-zinc-900"
            }`}
          >
            {config.label}
          </button>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">
            {activeConfig.label} ({items.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-40 pl-7 text-xs"
              />
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add {activeConfig.singularLabel}
            </Button>
            <BulkImportDialog
              module={`masters_${activeType}` as never}
              moduleLabel={activeConfig.label}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-zinc-500">No {activeConfig.label.toLowerCase()} found</p>
              <p className="text-xs text-zinc-400 mt-1">Click &quot;Add {activeConfig.singularLabel}&quot; to create one</p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <Table className="text-sm">
                <TableHeader className="sticky top-0 bg-white">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12">Sr.</TableHead>
                    <TableHead>{activeConfig.field === "referenceNumber" ? "Reference Number" : "Name"}</TableHead>
                    {activeConfig.hasContact && <TableHead>Phone</TableHead>}
                    {activeConfig.hasContact && <TableHead>Email</TableHead>}
                    {activeConfig.hasContact && <TableHead>Address</TableHead>}
                    {activeConfig.hasState && <TableHead>State</TableHead>}
                    {activeConfig.hasMake && <TableHead>Make</TableHead>}
                    {activeConfig.hasUrl && <TableHead>URL</TableHead>}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-zinc-500">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{getDisplayValue(item)}</TableCell>
                      {activeConfig.hasContact && <TableCell>{item.phone || "—"}</TableCell>}
                      {activeConfig.hasContact && <TableCell>{item.email || "—"}</TableCell>}
                      {activeConfig.hasContact && <TableCell className="max-w-xs truncate">{item.address || "—"}</TableCell>}
                      {activeConfig.hasState && (
                        <TableCell>{item.state?.name ?? "—"}</TableCell>
                      )}
                      {activeConfig.hasMake && (
                        <TableCell>{item.make?.name ?? "—"}</TableCell>
                      )}
                      {activeConfig.hasUrl && (
                        <TableCell className="max-w-xs truncate text-xs text-zinc-500">
                          {item.url ?? "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => openEdit(item)}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setDeleteConfirm(item)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "Add"} {activeConfig.singularLabel}
            </DialogTitle>
            <DialogDescription>
              {editing ? "Update the record details" : `Create a new ${activeConfig.singularLabel.toLowerCase()}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="master-value">
                {activeConfig.field === "referenceNumber" ? "Reference Number" : "Name"}
              </Label>
              <Input
                id="master-value"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                required
                placeholder={
                  activeConfig.field === "referenceNumber"
                    ? "e.g. SACE/ELE/MOR/12/072021"
                    : `Enter ${activeConfig.singularLabel.toLowerCase()} name`
                }
              />
            </div>

            {activeConfig.hasContact && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="master-phone">Phone / Mobile (optional)</Label>
                  <Input
                    id="master-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="e.g. +91 98250 12345"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="master-email">Email (optional)</Label>
                  <Input
                    id="master-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. contact@contractor.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="master-address">Address (optional)</Label>
                  <Input
                    id="master-address"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Office / registered address"
                  />
                </div>
              </>
            )}

            {activeConfig.hasUrl && (
              <div className="space-y-1.5">
                <Label htmlFor="master-url">URL (optional)</Label>
                <Input
                  id="master-url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}

            {activeConfig.hasState && (
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select value={formStateId} onValueChange={(v) => setFormStateId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state (optional)">
                      {formStateId
                        ? states.find((s) => s.id === formStateId)?.name || "Unknown State"
                        : "Select state (optional)"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeConfig.hasMake && (
              <div className="space-y-1.5">
                <Label>Make</Label>
                <Select value={formMakeId} onValueChange={(v) => setFormMakeId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select make (optional)">
                      {formMakeId
                        ? makes.find((m) => m.id === formMakeId)?.name || "Unknown Make"
                        : "Select make (optional)"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {makes.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Master data management")} askingAi={askingAi} aiResponse={aiResponse} />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {editing ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {activeConfig.singularLabel}?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteConfirm ? getDisplayValue(deleteConfirm) : ""}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <ErrorBanner error={error} onAskAi={(e) => askAi(e, "Deleting master item")} askingAi={askingAi} aiResponse={aiResponse} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={submitting}
            >
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

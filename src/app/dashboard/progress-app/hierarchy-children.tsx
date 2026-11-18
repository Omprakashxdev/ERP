"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createProgressWing,
  updateProgressWing,
  setProgressWingActive,
  createProgressFloor,
  updateProgressFloor,
  setProgressFloorActive,
  createProgressFlat,
  updateProgressFlat,
  setProgressFlatActive,
  createProgressRoom,
  updateProgressRoom,
  setProgressRoomActive,
} from "@/lib/actions/progress-hierarchy";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Loader2,
  Ban,
  RotateCcw,
  Layers,
  ChevronRight,
} from "lucide-react";
import { ProgressCell, RollupLike } from "./progress-bar";

type HierarchyKind = "wing" | "floor" | "flat" | "room";

interface HierarchyRow {
  id: string;
  isActive: boolean;
  displayOrder: number;
  code?: string;
  name?: string;
  description?: string | null;
  floorIdentifier?: string;
  displayName?: string | null;
  flatNumber?: string;
  flatType?: string | null;
  roomName?: string;
  roomType?: string | null;
  _count?: { floors?: number; flats?: number; rooms?: number };
}

interface FieldDef {
  key: string;
  label: string;
  input: "text" | "textarea" | "number";
  required?: boolean;
  placeholder?: string;
}

interface KindConfig {
  title: string;
  singular: string;
  emptyText: string;
  emptyHint: string;
  idKey: keyof HierarchyRow & string;
  nameKey?: keyof HierarchyRow & string;
  typeKey?: keyof HierarchyRow & string;
  countKey?: "floors" | "flats" | "rooms";
  countLabel?: string;
  parentKey: string;
  fields: FieldDef[];
  create: (input: never) => Promise<{ success: boolean; error?: string }>;
  update: (input: never) => Promise<{ success: boolean; error?: string }>;
  setActive: (
    id: string,
    active: boolean
  ) => Promise<{ success: boolean; error?: string }>;
}

const KIND_CONFIG: Record<HierarchyKind, KindConfig> = {
  wing: {
    title: "Blocks / Wings",
    singular: "wing",
    emptyText: "No blocks added yet.",
    emptyHint: "Add a block or wing to start structuring this site.",
    idKey: "code",
    nameKey: "name",
    typeKey: "description",
    countKey: "floors",
    countLabel: "Floors",
    parentKey: "siteId",
    fields: [
      { key: "code", label: "Wing code", input: "text", required: true, placeholder: "e.g. A, W-1, TOWER-B" },
      { key: "name", label: "Wing name", input: "text", required: true, placeholder: "e.g. Tower A" },
      { key: "description", label: "Description", input: "textarea", placeholder: "Optional notes about this wing" },
      { key: "displayOrder", label: "Display order", input: "number", placeholder: "0" },
    ],
    create: createProgressWing as never,
    update: updateProgressWing as never,
    setActive: setProgressWingActive,
  },
  floor: {
    title: "Floors",
    singular: "floor",
    emptyText: "No floors added yet.",
    emptyHint: "Add floors to this wing — each wing can have its own floor count.",
    idKey: "floorIdentifier",
    nameKey: "displayName",
    countKey: "flats",
    countLabel: "Flats",
    parentKey: "wingId",
    fields: [
      { key: "floorIdentifier", label: "Floor identifier", input: "text", required: true, placeholder: "e.g. G, 1, B1, TERRACE" },
      { key: "displayName", label: "Display name", input: "text", placeholder: "e.g. Ground Floor" },
      { key: "displayOrder", label: "Display order", input: "number", placeholder: "0" },
    ],
    create: createProgressFloor as never,
    update: updateProgressFloor as never,
    setActive: setProgressFloorActive,
  },
  flat: {
    title: "Flats",
    singular: "flat",
    emptyText: "No flats added yet.",
    emptyHint: "Add flats or units on this floor.",
    idKey: "flatNumber",
    typeKey: "flatType",
    countKey: "rooms",
    countLabel: "Rooms",
    parentKey: "floorId",
    fields: [
      { key: "flatNumber", label: "Flat number", input: "text", required: true, placeholder: "e.g. 101, A-101, SHOP-3" },
      { key: "flatType", label: "Flat type", input: "text", placeholder: "e.g. 2BHK, 3BHK, Shop" },
      { key: "displayOrder", label: "Display order", input: "number", placeholder: "0" },
    ],
    create: createProgressFlat as never,
    update: updateProgressFlat as never,
    setActive: setProgressFlatActive,
  },
  room: {
    title: "Rooms",
    singular: "room",
    emptyText: "No rooms added yet.",
    emptyHint: "Add rooms — each flat can have its own mix of rooms and types.",
    idKey: "roomName",
    typeKey: "roomType",
    parentKey: "flatId",
    fields: [
      { key: "roomName", label: "Room name", input: "text", required: true, placeholder: "e.g. Living Room, Bedroom 1, Kitchen" },
      { key: "roomType", label: "Room type", input: "text", placeholder: "e.g. Living, Bedroom, Kitchen, Bathroom, Balcony" },
      { key: "displayOrder", label: "Display order", input: "number", placeholder: "0" },
    ],
    create: createProgressRoom as never,
    update: updateProgressRoom as never,
    setActive: setProgressRoomActive,
  },
};

const DETAIL_HREF: Record<HierarchyKind, (id: string) => string | null> = {
  wing: (id) => `/dashboard/progress-app/wings/${id}`,
  floor: (id) => `/dashboard/progress-app/floors/${id}`,
  flat: (id) => `/dashboard/progress-app/flats/${id}`,
  room: (id) => `/dashboard/progress-app/rooms/${id}`,
};

interface HierarchyChildrenProps {
  kind: HierarchyKind;
  parentId: string;
  rows: unknown[];
  canManage: boolean;
  progressMap?: Record<string, RollupLike>;
}

function initialForm(fields: FieldDef[], row?: HierarchyRow) {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.key === "displayOrder") {
      out[f.key] = row ? String(row.displayOrder ?? 0) : "0";
    } else {
      const v = row ? (row[f.key as keyof HierarchyRow] as string | null | undefined) : "";
      out[f.key] = v ?? "";
    }
  }
  return out;
}

export function HierarchyChildren({
  kind,
  parentId,
  rows,
  canManage,
  progressMap,
}: HierarchyChildrenProps) {
  const cfg = KIND_CONFIG[kind];
  const router = useRouter();
  const typedRows = rows as HierarchyRow[];

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HierarchyRow | null>(null);
  const [toggleTarget, setToggleTarget] = useState<HierarchyRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  function openCreate() {
    setEditTarget(null);
    setForm(initialForm(cfg.fields));
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: HierarchyRow) {
    setEditTarget(row);
    setForm(initialForm(cfg.fields, row));
    setFormError(null);
    setFormOpen(true);
  }

  function rowLabel(row: HierarchyRow): string {
    return String(row[cfg.idKey] ?? "item");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const payload: Record<string, unknown> = {};
    for (const f of cfg.fields) {
      const raw = form[f.key];
      if (f.input === "number") {
        payload[f.key] = raw === "" ? 0 : Number(raw);
      } else if (!f.required && raw.trim() === "") {
        payload[f.key] = null;
      } else {
        payload[f.key] = raw;
      }
    }

    try {
      const res = editTarget
        ? await cfg.update({ id: editTarget.id, ...payload } as never)
        : await cfg.create({ [cfg.parentKey]: parentId, ...payload } as never);

      if (!res.success) {
        setFormError(res.error ?? `Failed to save ${cfg.singular}.`);
        toast.error(res.error ?? `Failed to save ${cfg.singular}.`);
        return;
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setFormError(msg);
      toast.error(msg);
      return;
    } finally {
      setSubmitting(false);
    }

    toast.success(
      editTarget
        ? `${capitalize(cfg.singular)} updated.`
        : `${capitalize(cfg.singular)} added.`
    );
    setFormOpen(false);
    router.refresh();
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    setToggling(true);
    setToggleError(null);
    const res = await cfg.setActive(toggleTarget.id, !toggleTarget.isActive);
    setToggling(false);
    if (!res.success) {
      setToggleError(res.error ?? "Could not update this item.");
      return;
    }
    toast.success(
      `${capitalize(cfg.singular)} ${toggleTarget.isActive ? "deactivated" : "reactivated"}.`
    );
    setToggleTarget(null);
    router.refresh();
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <Layers className="h-4 w-4" />
            {cfg.title}
            <Badge
              variant="secondary"
              className="font-normal text-xs bg-zinc-100 text-zinc-600"
            >
              {typedRows.length}
            </Badge>
          </CardTitle>
          {canManage && (
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add {cfg.singular}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {typedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-12 text-center">
            <Layers className="h-10 w-10 text-zinc-300" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              {cfg.emptyText}
            </p>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              {cfg.emptyHint}
            </p>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={openCreate}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add {cfg.singular}
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-100">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="whitespace-nowrap capitalize">
                    {cfg.singular}
                  </TableHead>
                  {cfg.nameKey && (
                    <TableHead className="whitespace-nowrap">Name</TableHead>
                  )}
                  {cfg.typeKey && (
                    <TableHead className="whitespace-nowrap">
                      {kind === "wing" ? "Description" : "Type"}
                    </TableHead>
                  )}
                  <TableHead className="whitespace-nowrap text-right">
                    Order
                  </TableHead>
                  {cfg.countKey && (
                    <TableHead className="whitespace-nowrap text-right">
                      {cfg.countLabel}
                    </TableHead>
                  )}
                  <TableHead className="whitespace-nowrap">Progress</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typedRows.map((row) => {
                  const href = DETAIL_HREF[kind](row.id);
                  const inactive = !row.isActive;
                  return (
                    <TableRow
                      key={row.id}
                      className={`transition-colors ${
                        inactive ? "opacity-55" : "hover:bg-zinc-50/70"
                      }`}
                    >
                      <TableCell className="whitespace-nowrap font-mono font-semibold">
                        {href ? (
                          <Link
                            href={href}
                            className="inline-flex items-center gap-1 text-zinc-900 hover:text-zinc-600 hover:underline"
                          >
                            {rowLabel(row)}
                            <ChevronRight className="h-3 w-3 text-zinc-400" />
                          </Link>
                        ) : (
                          rowLabel(row)
                        )}
                      </TableCell>
                      {cfg.nameKey && (
                        <TableCell className="whitespace-nowrap font-medium">
                          {String(row[cfg.nameKey] ?? "—") || "—"}
                        </TableCell>
                      )}
                      {cfg.typeKey && (
                        <TableCell className="max-w-52 truncate">
                          {(row[cfg.typeKey] as string | null | undefined) ??
                            "—"}
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap text-right">
                        {row.displayOrder}
                      </TableCell>
                      {cfg.countKey && (
                        <TableCell className="whitespace-nowrap text-right">
                          {row._count?.[cfg.countKey] ?? 0}
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap">
                        <ProgressCell rollup={progressMap?.[row.id]} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            row.isActive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-zinc-100 text-zinc-500 border-zinc-200"
                          }
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {canManage && (
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5"
                              onClick={() => openEdit(row)}
                              title={`Edit ${cfg.singular}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                setToggleTarget(row);
                                setToggleError(null);
                              }}
                              title={
                                row.isActive
                                  ? `Deactivate ${cfg.singular}`
                                  : `Reactivate ${cfg.singular}`
                              }
                            >
                              {row.isActive ? (
                                <Ban className="h-3.5 w-3.5 text-amber-600" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => !open && setFormOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget
                ? `Edit ${cfg.singular}: ${rowLabel(editTarget)}`
                : `Add ${cfg.singular}`}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              {editTarget
                ? `Update this ${cfg.singular}.`
                : `Create a new ${cfg.singular} in this level of the hierarchy.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
            {cfg.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`hc-${f.key}`}>
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </Label>
                {f.input === "textarea" ? (
                  <Textarea
                    id={`hc-${f.key}`}
                    value={form[f.key] ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, [f.key]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                    rows={2}
                  />
                ) : (
                  <Input
                    id={`hc-${f.key}`}
                    type={f.input === "number" ? "number" : "text"}
                    min={f.input === "number" ? 0 : undefined}
                    value={form[f.key] ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, [f.key]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                    required={f.required}
                    disabled={editTarget !== null && f.key === cfg.idKey}
                    className={
                      editTarget !== null && f.key === cfg.idKey
                        ? "bg-zinc-50 text-zinc-500"
                        : undefined
                    }
                  />
                )}
                {editTarget !== null && f.key === cfg.idKey && (
                  <p className="text-[11px] text-zinc-400">
                    The {cfg.singular} identifier cannot be changed after
                    creation.
                  </p>
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editTarget ? "Save changes" : `Add ${cfg.singular}`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate / Reactivate confirm */}
      <Dialog
        open={toggleTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setToggleTarget(null);
            setToggleError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {toggleTarget?.isActive ? "Deactivate" : "Reactivate"}{" "}
              {cfg.singular}
            </DialogTitle>
            <DialogDescription>
              {toggleTarget?.isActive
                ? `Deactivate ${rowLabel(toggleTarget)}? It will be hidden from active lists but remains in the database along with all of its descendants. You can reactivate it at any time.`
                : `Reactivate ${toggleTarget ? rowLabel(toggleTarget) : ""}? It will appear in active lists again.`}
            </DialogDescription>
          </DialogHeader>
          {toggleError && (
            <p className="text-sm text-red-600">{toggleError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setToggleTarget(null)}
              disabled={toggling}
            >
              Cancel
            </Button>
            <Button
              variant={toggleTarget?.isActive ? "destructive" : "default"}
              onClick={handleToggleActive}
              disabled={toggling}
            >
              {toggling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {toggleTarget?.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

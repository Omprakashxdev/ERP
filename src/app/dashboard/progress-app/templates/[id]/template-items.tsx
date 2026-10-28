"use client";

import { useState } from "react";
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
  createProgressTemplateItem,
  updateProgressTemplateItem,
  setProgressTemplateItemActive,
  moveProgressTemplateItem,
} from "@/lib/actions/progress-activity";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Loader2,
  Ban,
  RotateCcw,
  ListOrdered,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface ItemRow {
  id: string;
  activityName: string;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface TemplateItemsProps {
  templateId: string;
  items: ItemRow[];
  canManage: boolean;
}

export function TemplateItems({
  templateId,
  items,
  canManage,
}: TemplateItemsProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemRow | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ItemRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const activeItems = items.filter((i) => i.isActive);

  function openCreate() {
    setEditTarget(null);
    setName("");
    setDescription("");
    setOrder("0");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(item: ItemRow) {
    setEditTarget(item);
    setName(item.activityName);
    setDescription(item.description ?? "");
    setOrder(String(item.displayOrder));
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const res = editTarget
      ? await updateProgressTemplateItem({
          id: editTarget.id,
          activityName: name,
          description: description || null,
          displayOrder: Number(order) || 0,
        })
      : await createProgressTemplateItem({
          templateId,
          activityName: name,
          description: description || null,
          displayOrder: Number(order) || 0,
        });
    setSubmitting(false);
    if (!res.success) {
      setFormError(res.error ?? "Failed to save activity.");
      toast.error(res.error ?? "Failed to save activity.");
      return;
    }
    toast.success(editTarget ? "Activity updated." : "Activity added.");
    setFormOpen(false);
    router.refresh();
  }

  async function handleMove(item: ItemRow, direction: "up" | "down") {
    setMoving(item.id);
    const res = await moveProgressTemplateItem(item.id, direction);
    setMoving(null);
    if (!res.success) {
      toast.error(res.error ?? "Could not reorder.");
      return;
    }
    router.refresh();
  }

  async function handleToggle() {
    if (!toggleTarget) return;
    const res = await setProgressTemplateItemActive(
      toggleTarget.id,
      !toggleTarget.isActive
    );
    if (!res.success) {
      setToggleError(res.error ?? "Could not update this activity.");
      return;
    }
    toast.success(
      `Activity ${toggleTarget.isActive ? "deactivated" : "reactivated"}.`
    );
    setToggleTarget(null);
    router.refresh();
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <ListOrdered className="h-4 w-4" />
            Activities
            <Badge
              variant="secondary"
              className="font-normal text-xs bg-zinc-100 text-zinc-600"
            >
              {activeItems.length} active
            </Badge>
          </CardTitle>
          {canManage && (
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add activity
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-10 text-center">
            <ListOrdered className="h-10 w-10 text-zinc-300" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              No activities yet.
            </p>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              Add the activities for this checklist in execution order.
            </p>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={openCreate}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add activity
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-100">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 whitespace-nowrap text-right">
                    #
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Activity</TableHead>
                  <TableHead className="whitespace-nowrap">
                    Description
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow
                    key={item.id}
                    className={`transition-colors ${
                      item.isActive ? "hover:bg-zinc-50/70" : "opacity-55"
                    }`}
                  >
                    <TableCell className="whitespace-nowrap text-right text-zinc-500">
                      {item.displayOrder}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {item.activityName}
                    </TableCell>
                    <TableCell className="max-w-52 truncate">
                      {item.description ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={
                          item.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-zinc-100 text-zinc-500 border-zinc-200"
                        }
                      >
                        {item.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {canManage && (
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={idx === 0 || moving === item.id}
                            onClick={() => handleMove(item, "up")}
                            title="Move up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={
                              idx === items.length - 1 || moving === item.id
                            }
                            onClick={() => handleMove(item, "down")}
                            title="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5"
                            onClick={() => openEdit(item)}
                            title="Edit activity"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setToggleTarget(item);
                              setToggleError(null);
                            }}
                            title={
                              item.isActive
                                ? "Deactivate activity"
                                : "Reactivate activity"
                            }
                          >
                            {item.isActive ? (
                              <Ban className="h-3.5 w-3.5 text-amber-600" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? `Edit activity` : "Add activity"}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              {editTarget
                ? "Update this activity. Rooms already assigned keep their snapshot."
                : "Add an activity to this checklist template."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ti-name">
                Activity name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ti-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Internal Plaster"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ti-description">Description</Label>
              <Textarea
                id="ti-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional details about this activity"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ti-order">Display order</Label>
              <Input
                id="ti-order"
                type="number"
                min={0}
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </div>
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
                {editTarget ? "Save changes" : "Add activity"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
              {toggleTarget?.isActive ? "Deactivate" : "Reactivate"} activity
            </DialogTitle>
            <DialogDescription>
              {toggleTarget?.isActive
                ? `Deactivate "${toggleTarget?.activityName}"? It will be excluded from future assignments; rooms already assigned keep their snapshot.`
                : `Reactivate "${toggleTarget?.activityName}"?`}
            </DialogDescription>
          </DialogHeader>
          {toggleError && <p className="text-sm text-red-600">{toggleError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setToggleTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={toggleTarget?.isActive ? "destructive" : "default"}
              onClick={handleToggle}
            >
              {toggleTarget?.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

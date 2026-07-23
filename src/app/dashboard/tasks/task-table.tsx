"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertCircle, Pencil, MoreHorizontal } from "lucide-react";
import { TaskEditForm, TaskStatusActions } from "./task-form";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedToId: string;
  projectId: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  reworkCount: number;
  assignedTo: { id: string; name: string; designation: string | null };
  assignedBy: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  createdAt: Date;
}

const statusColors: Record<string, string> = {
  OPEN: "bg-zinc-100 text-zinc-700",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  PENDING_REVIEW: "bg-purple-50 text-purple-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

const statusLabels: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  PENDING_REVIEW: "Pending Review",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const priorityColors: Record<string, string> = {
  LOW: "bg-zinc-50 text-zinc-600",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-orange-50 text-orange-700",
  CRITICAL: "bg-red-50 text-red-700",
};

export function TaskTable({
  tasks,
  total,
  page,
  pageSize,
  staff,
  projects,
}: {
  tasks: TaskRow[];
  total: number;
  page: number;
  pageSize: number;
  staff?: { id: string; name: string }[];
  projects?: { id: string; name: string }[];
}) {
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [statusTask, setStatusTask] = useState<TaskRow | null>(null);
  const totalPages = Math.ceil(total / pageSize);
  const now = new Date();

  const canEdit = (status: string) => status !== "COMPLETED" && status !== "CANCELLED";
  const canChangeStatus = (status: string) =>
    status === "OPEN" || status === "IN_PROGRESS" ||
    status === "ON_HOLD" || status === "PENDING_REVIEW";

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm text-zinc-500">No tasks found.</p>
        <p className="mt-1 text-xs text-zinc-400">
          Create a new task to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border">
        <div className="max-h-[60vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Title</TableHead>
                <TableHead className="whitespace-nowrap">Assigned To</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Priority</TableHead>
                <TableHead className="whitespace-nowrap">Due Date</TableHead>
                <TableHead className="whitespace-nowrap">Project</TableHead>
                <TableHead className="whitespace-nowrap">Rework</TableHead>
                <TableHead className="whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const isOverdue =
                  task.dueDate &&
                  new Date(task.dueDate) < now &&
                  task.status !== "COMPLETED" &&
                  task.status !== "CANCELLED";

                return (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {isOverdue && (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {task.title}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {task.assignedTo.name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColors[task.status] ?? "bg-zinc-100 text-zinc-600"}`}
                      >
                        {statusLabels[task.status] ?? task.status}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityColors[task.priority] ?? "bg-zinc-50 text-zinc-600"}`}
                      >
                        {task.priority}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {task.dueDate ? (
                        <span className={isOverdue ? "text-red-600 font-medium" : "text-zinc-500"}>
                          {new Date(task.dueDate).toLocaleDateString("en-IN")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-zinc-500">
                      {task.project?.name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {task.reworkCount > 0 ? (
                        <span className="text-amber-600 font-medium">
                          {task.reworkCount}x
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex gap-1">
                        {canEdit(task.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditTask(task)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canChangeStatus(task.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setStatusTask(task)}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

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
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(page - 1));
                window.location.search = params.toString();
              }}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(page + 1));
                window.location.search = params.toString();
              }}
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {editTask && staff && (
        <TaskEditForm
          task={editTask}
          staff={staff}
          projects={projects}
          onClose={() => setEditTask(null)}
        />
      )}

      {statusTask && (
        <TaskStatusActions
          taskId={statusTask.id}
          status={statusTask.status}
          onClose={() => setStatusTask(null)}
        />
      )}
    </div>
  );
}

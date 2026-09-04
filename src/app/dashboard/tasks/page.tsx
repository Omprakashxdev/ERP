import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTasks } from "@/lib/actions/task-management";
import { getStaff } from "@/lib/actions/staff";
import { getProjects } from "@/lib/actions/project";
import { serialize } from "@/lib/utils";
import { TaskTable } from "./task-table";
import { TaskFilters } from "./task-filters";
import { TaskSkeleton } from "./task-skeleton";
import { TaskFormDialog } from "./task-form";
import { TaskFilterInput } from "@/lib/schemas/task-management";
import { CheckSquare } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { ModuleHeader } from "@/components/module-header";

interface TasksPageProps {
  searchParams: Promise<{
    search?: string;
    assignedToId?: string;
    status?: string;
    priority?: string;
    overdue?: string;
    page?: string;
  }>;
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 25;

  const filter: TaskFilterInput = {
    search: params.search,
    assignedToId: params.assignedToId,
    status: params.status as never,
    priority: params.priority as never,
    overdue: params.overdue as never,
  };

  const [tasksResult, staffResult, projectsResult] = await Promise.all([
    getTasks(filter, page, pageSize),
    getStaff(),
    getProjects(undefined, 1, 100),
  ]);

  const tasks = tasksResult.success ? tasksResult.data!.rows : [];
  const total = tasksResult.success ? tasksResult.data!.total : 0;
  const staff = staffResult.success ? staffResult.data! : [];
  const projects = projectsResult.success ? projectsResult.data!.rows : [];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <ModuleHeader
        icon={CheckSquare}
        title="Tasks"
        description="To-do task management and tracking"
        reportCategory="tasks"
        totalCount={total}
        countLabel="Tasks"
      >
        <BulkImportDialog module="tasks" moduleLabel="Tasks" />
        <TaskFormDialog staff={serialize(staff) as never} projects={serialize(projects) as never} />
      </ModuleHeader>

      <TaskFilters staff={serialize(staff) as never} />


      <Suspense key={`tasks-${page}`} fallback={<TaskSkeleton />}>
        <TaskTable
          tasks={serialize(tasks) as never}
          total={total}
          page={page}
          pageSize={pageSize}
          staff={serialize(staff) as never}
          projects={serialize(projects) as never}
        />
      </Suspense>
    </div>
  );
}

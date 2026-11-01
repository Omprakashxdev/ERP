import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import { getStaff } from "@/lib/actions/staff";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { Database } from "lucide-react";
import { MastersManager } from "@/components/masters/masters-manager";

export const metadata = {
  title: "Masters — SAEC ERP",
};

export default async function MastersPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; edit?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const session = await auth();
  const canManageStaff = session?.user
    ? hasPermission(session.user.role, "staffManagement", "create")
    : false;
  const canManageClients = session?.user
    ? hasPermission(session.user.role, "clientManagement", "create")
    : false;
  const canManageProjects = session?.user
    ? hasPermission(session.user.role, "projectManagement", "create") ||
      hasPermission(session.user.role, "projectManagement", "update")
    : false;

  const [
    staffResult,
    regions,
    departments,
    designations,
    cities,
    clients,
    projects,
  ] = await Promise.all([
    getStaff(undefined, false),
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.designation.findMany({ orderBy: { name: "asc" } }),
    prisma.city.findMany({ orderBy: { name: "asc" } }),
    prisma.client.findMany({
      include: { contacts: true, _count: { select: { projects: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      include: {
        region: true,
        client: true,
        contractor: true,
        assignments: { include: { staff: true } },
        feeStages: true,
        fundFlow: true,
      },
      orderBy: { workOrderDate: "desc" },
    }),
  ]);

  const staff = staffResult.success ? (staffResult.data ?? []) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Masters & Lookup Data
          </h1>
          <p className="text-sm text-zinc-500">
            Manage system lookups, categories, regions, clients, projects, and employee master
          </p>
        </div>
      </div>

      <MastersManager
        initialTab={params?.tab}
        initialEditProjectId={params?.edit}
        clientsData={serialize(clients) as never}
        projectsData={serialize(projects) as never}
        staffData={serialize(staff) as never}
        regionsData={serialize(regions) as never}
        departmentsData={serialize(departments) as never}
        designationsData={serialize(designations) as never}
        citiesData={serialize(cities) as never}
        canManage={canManageStaff}
        canManageClients={canManageClients}
        canManageProjects={canManageProjects}
      />
    </div>
  );
}

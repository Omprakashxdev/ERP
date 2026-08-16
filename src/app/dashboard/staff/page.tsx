import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import { getStaff } from "@/lib/actions/staff";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { StaffTable } from "./staff-table";
import { Card, CardContent } from "@/components/ui/card";
import { UserCog } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";

export const metadata = {
  title: "Staff — SAEC ERP",
};

export default async function StaffPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const canManage = hasPermission(session.user.role, "staffManagement", "create");

  const [staffResult, regions, departments, designations, cities] = await Promise.all([
    getStaff(undefined, false),
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.designation.findMany({ orderBy: { name: "asc" } }),
    prisma.city.findMany({ orderBy: { name: "asc" } }),
  ]);

  const staff = staffResult.success ? (staffResult.data ?? []) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <UserCog className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
            <p className="text-sm text-zinc-500">
              Manage staff master, designations, and regions
            </p>
          </div>
        </div>
        {canManage && <BulkImportDialog module="staff" moduleLabel="Staff" />}
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <StaffTable
            staff={serialize(staff) as never}
            regions={serialize(regions) as never}
            departments={serialize(departments) as never}
            designations={serialize(designations) as never}
            cities={serialize(cities) as never}
            canManage={canManage}
          />
        </CardContent>
      </Card>
    </div>
  );
}

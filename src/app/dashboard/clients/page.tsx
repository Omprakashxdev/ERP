import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { ClientsTable } from "./clients-table";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { ModuleHeader } from "@/components/module-header";

export default async function ClientsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const canManage = hasPermission(session.user.role, "clientManagement", "create");

  const clients = await prisma.client.findMany({
    include: { contacts: true, _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ModuleHeader
        icon={Users}
        title="Clients"
        description="Manage client master and contact details"
        reportCategory="due-bills"
        returnHref="/dashboard/clients"
        totalCount={clients.length}
        countLabel="Clients"
      >
        {canManage && <BulkImportDialog module="clients" moduleLabel="Clients" />}
      </ModuleHeader>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <ClientsTable clients={serialize(clients) as never} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  );
}

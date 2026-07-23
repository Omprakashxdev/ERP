import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { ClientsTable } from "./clients-table";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
            <p className="text-sm text-zinc-500">
              Manage client master and contact details
            </p>
          </div>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <ClientsTable clients={serialize(clients) as never} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  );
}

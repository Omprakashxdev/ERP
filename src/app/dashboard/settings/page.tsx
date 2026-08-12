import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExportImportPanel } from "./export-import-panel";
import { NotificationsPanel } from "./notifications-panel";
import { AuditLogPanel } from "./audit-log-panel";
import { UserManagementPanel } from "./user-management-panel";
import { UserRightsPanel } from "./user-rights-panel";
import { Settings, Download, Bell, Shield, Users, KeyRound, Network } from "lucide-react";
import { OrgChartPanel } from "./org-chart-panel";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const canExportImport = hasPermission(session.user.role, "exportImport", "read");
  const canManageNotifications = hasPermission(session.user.role, "notifications", "read");
  const canViewAuditLog = hasPermission(session.user.role, "auditLog", "read");
  const canManageUsers = hasPermission(session.user.role, "userManagement", "read");

  const canViewRights = true;
  const canViewOrgChart = true;

  const hasAnyAccess =
    canExportImport || canManageNotifications || canViewAuditLog || canManageUsers || canViewRights || canViewOrgChart;

  if (!hasAnyAccess) {
    redirect("/unauthorized");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
          <Settings className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-zinc-500">
            Manage exports, notifications, audit logs, and users
          </p>
        </div>
      </div>

      <Tabs defaultValue="export">
        <TabsList className="flex-wrap h-auto">
          {canExportImport && (
            <TabsTrigger value="export">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export / Import
            </TabsTrigger>
          )}
          {canManageNotifications && (
            <TabsTrigger value="notifications">
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              Notifications
            </TabsTrigger>
          )}
          {canViewAuditLog && (
            <TabsTrigger value="audit">
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              Audit Log
            </TabsTrigger>
          )}
          {canManageUsers && (
            <TabsTrigger value="users">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Users
            </TabsTrigger>
          )}
          {canViewRights && (
            <TabsTrigger value="rights">
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              Rights
            </TabsTrigger>
          )}
          {canViewOrgChart && (
            <TabsTrigger value="orgchart">
              <Network className="mr-1.5 h-3.5 w-3.5" />
              Org Chart
            </TabsTrigger>
          )}
        </TabsList>

        {canExportImport && (
          <TabsContent value="export">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <ExportImportPanel />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageNotifications && (
          <TabsContent value="notifications">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <NotificationsPanel />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canViewAuditLog && (
          <TabsContent value="audit">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <AuditLogPanel />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageUsers && (
          <TabsContent value="users">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <UserManagementPanel />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canViewRights && (
          <TabsContent value="rights">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <UserRightsPanel isAdmin={session.user.role === "ADMIN"} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
        {canViewOrgChart && (
          <TabsContent value="orgchart">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <OrgChartPanel />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

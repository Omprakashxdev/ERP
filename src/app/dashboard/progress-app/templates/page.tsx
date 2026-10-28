import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import { getProgressTemplates } from "@/lib/actions/progress-activity";
import { serialize } from "@/lib/utils";
import { TemplatesTable } from "./templates-table";
import { ModuleHeader } from "@/components/module-header";
import { ClipboardList } from "lucide-react";

export const metadata = {
  title: "Checklist Templates — Progress App — SAEC ERP",
};

export default async function ProgressTemplatesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const canManage = hasPermission(session.user.role, "progressApp", "create");

  const result = await getProgressTemplates();
  const templates = result.success ? (result.data ?? []) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ModuleHeader
        icon={ClipboardList}
        title="Activity Checklist Templates"
        description="ERP-managed activity checklists that can be assigned to rooms."
      />
      <TemplatesTable
        rows={serialize(templates) as never[]}
        canManage={canManage}
      />
    </div>
  );
}

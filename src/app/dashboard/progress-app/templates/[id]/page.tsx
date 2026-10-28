import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/authz";
import { getProgressTemplateById } from "@/lib/actions/progress-activity";
import { serialize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, ArrowLeft, DoorOpen } from "lucide-react";
import { HierarchyBreadcrumbs } from "../../hierarchy-breadcrumbs";
import { TemplateItems } from "./template-items";
import { TemplateDetailActions } from "./template-detail-actions";

export const metadata = {
  title: "Template — Progress App — SAEC ERP",
};

interface ChecklistUsage {
  id: string;
  templateVersion: number;
  assignedAt: string | Date;
  room: {
    id: string;
    roomName: string;
    flat: {
      flatNumber: string;
      floor: {
        floorIdentifier: string;
        wing: { code: string; site: { siteName: string } };
      };
    };
  };
  _count: { activities: number };
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">
        {label}
      </span>
      <span className="text-sm font-medium text-zinc-900">{value ?? "—"}</span>
    </div>
  );
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const canManage = hasPermission(session.user.role, "progressApp", "create");

  const result = await getProgressTemplateById(id);
  if (!result.success || !result.data) {
    notFound();
  }

  const template = result.data as {
    id: string;
    name: string;
    description?: string | null;
    version: number;
    isActive: boolean;
    createdAt: string | Date;
    items: unknown[];
    checklists: ChecklistUsage[];
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <HierarchyBreadcrumbs
        items={[
          {
            label: "Checklist Templates",
            href: "/dashboard/progress-app/templates",
          },
          { label: template.name },
        ]}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/progress-app/templates">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                {template.name}
              </h1>
              <Badge
                variant="outline"
                className={
                  template.isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-zinc-100 text-zinc-500 border-zinc-200"
                }
              >
                {template.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-zinc-500">
              Template version v{template.version}
            </p>
          </div>
        </div>
        {canManage && <TemplateDetailActions template={template} />}
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-700">
            Template details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <DetailRow label="Name" value={template.name} />
            <DetailRow label="Version" value={`v${template.version}`} />
            <DetailRow
              label="Activities"
              value={template.items.length}
            />
            <DetailRow
              label="Rooms using"
              value={template.checklists.length}
            />
            {template.description && (
              <div className="col-span-2">
                <DetailRow label="Description" value={template.description} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <TemplateItems
        templateId={template.id}
        items={serialize(template.items) as never[]}
        canManage={canManage && template.isActive}
      />

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <DoorOpen className="h-4 w-4" />
            Rooms using this template
            <Badge
              variant="secondary"
              className="font-normal text-xs bg-zinc-100 text-zinc-600"
            >
              {template.checklists.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {template.checklists.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-8 text-center text-xs text-zinc-500">
              No rooms currently use this template.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-zinc-500">
                    <th className="px-3 py-2 font-semibold">Room</th>
                    <th className="px-3 py-2 font-semibold">Location</th>
                    <th className="px-3 py-2 font-semibold text-right">
                      Activities
                    </th>
                    <th className="px-3 py-2 font-semibold text-right">
                      Snapshot
                    </th>
                    <th className="px-3 py-2 font-semibold">Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {template.checklists.map((c) => (
                    <tr key={c.id} className="border-b border-zinc-50">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/dashboard/progress-app/rooms/${c.room.id}`}
                          className="text-zinc-900 hover:underline"
                        >
                          {c.room.roomName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {c.room.flat.floor.wing.site.siteName} · Wing{" "}
                        {c.room.flat.floor.wing.code} · Floor{" "}
                        {c.room.flat.floor.floorIdentifier} · Flat{" "}
                        {c.room.flat.flatNumber}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c._count.activities}
                      </td>
                      <td className="px-3 py-2 text-right">
                        v{c.templateVersion}
                      </td>
                      <td className="px-3 py-2">
                        {new Date(c.assignedAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteSetupCounts } from "@/lib/actions/progress-site";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  ListChecks,
} from "lucide-react";

interface SetupStep {
  label: string;
  count: number;
  configured: boolean;
  /** Where this level is managed — deep link into the existing pages. */
  href: string | null;
  /** Call-to-action when nothing is configured yet. */
  emptyCta: string;
}

export function SiteSetupCard({
  siteId,
  counts,
  canManage,
}: {
  siteId: string;
  counts: SiteSetupCounts;
  canManage: boolean;
}) {
  const steps: SetupStep[] = [
    {
      label: "Site details",
      count: 1,
      configured: true,
      href: `/dashboard/progress-app/sites/${siteId}`,
      emptyCta: "",
    },
    {
      label: "Wings / Blocks",
      count: counts.wings,
      configured: counts.wings > 0,
      href:
        counts.wings > 0 && counts.firstWingId
          ? `/dashboard/progress-app/wings/${counts.firstWingId}`
          : "#site-structure",
      emptyCta: "Add first wing",
    },
    {
      label: "Floors",
      count: counts.floors,
      configured: counts.floors > 0,
      href: counts.firstWingId
        ? `/dashboard/progress-app/wings/${counts.firstWingId}`
        : null,
      emptyCta: "Add floor",
    },
    {
      label: "Flats and flat numbers",
      count: counts.flats,
      configured: counts.flats > 0,
      href: counts.firstFloorId
        ? `/dashboard/progress-app/floors/${counts.firstFloorId}`
        : null,
      emptyCta: "Add flat",
    },
    {
      label: "Rooms",
      count: counts.rooms,
      configured: counts.rooms > 0,
      href: counts.firstFlatId
        ? `/dashboard/progress-app/flats/${counts.firstFlatId}`
        : null,
      emptyCta: "Add room",
    },
    {
      label: "Room activity checklists",
      count: counts.checklists,
      configured: counts.checklists > 0,
      href: counts.firstRoomId
        ? `/dashboard/progress-app/rooms/${counts.firstRoomId}`
        : null,
      emptyCta: "Assign activity checklist",
    },
    {
      label: "Employee assignments",
      count: counts.assignments,
      configured: counts.assignments > 0,
      href: "#site-assignments",
      emptyCta: "Assign staff",
    },
  ];

  const doneCount = steps.filter((s) => s.configured).length;

  return (
    <Card className="shadow-sm" id="site-setup">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <ListChecks className="h-4 w-4" />
            Site setup
            <Badge
              variant="secondary"
              className="font-normal text-xs bg-zinc-100 text-zinc-600"
            >
              {doneCount} of {steps.length} configured
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ol className="divide-y divide-zinc-100">
          {steps.map((step, i) => (
            <li key={step.label} className="flex items-center gap-3 py-2.5">
              <span className="w-6 shrink-0 text-center text-xs font-semibold text-zinc-400">
                {i + 1}
              </span>
              {step.configured ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-zinc-300" />
              )}
              <span className="min-w-0 flex-1 text-sm font-medium text-zinc-800">
                {step.label}
              </span>
              {step.configured && step.label !== "Site details" && (
                <Badge
                  variant="secondary"
                  className="font-normal text-xs bg-zinc-100 text-zinc-600"
                >
                  {step.count}
                </Badge>
              )}
              {step.href ? (
                step.configured || canManage ? (
                  <Link href={step.href}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                    >
                      {step.configured ? "Manage" : step.emptyCta}
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                ) : (
                  <span className="text-xs text-zinc-400">Not configured</span>
                )
              ) : (
                <span className="text-xs text-zinc-400">
                  {step.configured ? "—" : "Configure previous step"}
                </span>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

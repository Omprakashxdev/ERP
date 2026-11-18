import {
  LayoutDashboard,
  Landmark,
  FileText,
  Hammer,
  HardHat,
  ClipboardList,
  CalendarDays,
  Car,
  Box,
  ArrowLeftRight,
  ReceiptText,
  CheckSquare,
  BarChart3,
  Settings,
  Users,
  Database,
  UserCog,
  Building2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  resource?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Home",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Overview & alerts",
      },
    ],
  },
  {
    label: "Projects",
    items: [
      {
        label: "Fund Flow",
        href: "/dashboard/fund-flow",
        resource: "fundFlow",
        icon: Landmark,
        description: "Project finances",
      },
      {
        label: "Due Bills",
        href: "/dashboard/due-bills",
        resource: "dueBills",
        icon: FileText,
        description: "Bills & payments",
      },
      {
        label: "Work in Progress",
        href: "/dashboard/wip",
        resource: "wip",
        icon: Hammer,
        description: "Active work status",
      },
    ],
  },
  {
    label: "Contracts",
    items: [
      {
        label: "Contractors",
        href: "/dashboard/contractors",
        resource: "contractors",
        icon: HardHat,
        description: "Vendor management",
      },
      {
        label: "Tenders",
        href: "/dashboard/tenders",
        resource: "tenders",
        icon: ClipboardList,
        description: "Bids & proposals",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Payment Schedules",
        href: "/dashboard/payment-schedules",
        resource: "paymentSchedules",
        icon: CalendarDays,
        description: "Upcoming payments",
      },
      {
        label: "TADA Bills",
        href: "/dashboard/tada-bills",
        resource: "tadaBills",
        icon: ReceiptText,
        description: "Travel & expense claims",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Vehicle Log Book",
        href: "/dashboard/vehicle-log-book",
        resource: "vehicleLogBook",
        icon: Car,
        description: "Vehicle tracking",
      },
      {
        label: "Property",
        href: "/dashboard/property",
        resource: "assets",
        icon: Box,
        description: "Equipment & property",
      },
      {
        label: "In-Out Register",
        href: "/dashboard/in-out-register",
        resource: "inOutRegister",
        icon: ArrowLeftRight,
        description: "Document tracking",
      },
      {
        label: "Tasks",
        href: "/dashboard/tasks",
        resource: "taskManagement",
        icon: CheckSquare,
        description: "Team assignments",
      },
    ],
  },
  {
    label: "Progress App",
    items: [
      {
        label: "Site Management",
        href: "/dashboard/progress-app",
        resource: "progressApp",
        icon: Building2,
        description: "Construction site master",
      },
      {
        label: "Checklist Templates",
        href: "/dashboard/progress-app/templates",
        resource: "progressApp",
        icon: CheckSquare,
        description: "Activity checklists for rooms",
      },
    ],
  },
  {
    label: "Masters",
    items: [
      {
        label: "Masters",
        href: "/dashboard/masters",
        icon: Database,
        description: "Lookup data, client & employee master",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Reports",
        href: "/dashboard/reports",
        resource: "reports",
        icon: BarChart3,
        description: "Analytics & exports",
      },
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
        description: "Configuration",
      },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

// Returns nav groups filtered by the user's effective module access.
// Items without a `resource` tag are always visible; groups left empty are dropped.
export function filterNavGroups(
  access: Record<string, string[]>
): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !item.resource || (access[item.resource] ?? []).includes("read")
      ),
    }))
    .filter((group) => group.items.length > 0);
}

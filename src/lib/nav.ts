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
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
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
        icon: Landmark,
        description: "Project finances",
      },
      {
        label: "Due Bills",
        href: "/dashboard/due-bills",
        icon: FileText,
        description: "Bills & payments",
      },
      {
        label: "Work in Progress",
        href: "/dashboard/wip",
        icon: Hammer,
        description: "Active work status",
      },
      {
        label: "Clients",
        href: "/dashboard/clients",
        icon: Users,
        description: "Client master",
      },
      {
        label: "Staff",
        href: "/dashboard/staff",
        icon: UserCog,
        description: "Staff master",
      },
    ],
  },
  {
    label: "Contracts",
    items: [
      {
        label: "Contractors",
        href: "/dashboard/contractors",
        icon: HardHat,
        description: "Vendor management",
      },
      {
        label: "Tenders",
        href: "/dashboard/tenders",
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
        icon: CalendarDays,
        description: "Upcoming payments",
      },
      {
        label: "TADA Bills",
        href: "/dashboard/tada-bills",
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
        icon: Car,
        description: "Vehicle tracking",
      },
      {
        label: "Assets",
        href: "/dashboard/assets",
        icon: Box,
        description: "Equipment & property",
      },
      {
        label: "In-Out Register",
        href: "/dashboard/in-out-register",
        icon: ArrowLeftRight,
        description: "Document tracking",
      },
      {
        label: "Tasks",
        href: "/dashboard/tasks",
        icon: CheckSquare,
        description: "Team assignments",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Reports",
        href: "/dashboard/reports",
        icon: BarChart3,
        description: "Analytics & exports",
      },
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
        description: "Configuration",
      },
      {
        label: "Masters",
        href: "/dashboard/masters",
        icon: Database,
        description: "Manage lookup data",
      },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

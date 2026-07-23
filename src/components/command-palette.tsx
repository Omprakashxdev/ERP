"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  CalendarDays,
  Car,
  ClipboardList,
  FileText,
  Hammer,
  HardHat,
  Landmark,
  LayoutDashboard,
  Box,
  ArrowLeftRight,
  Settings,
  Sparkles,
  Bell,
  Shield,
  Download,
  ReceiptText,
  CheckSquare,
  BarChart3,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";

const navigationItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Fund Flow", href: "/dashboard/fund-flow", icon: Landmark },
  { label: "Due Bills", href: "/dashboard/due-bills", icon: FileText },
  { label: "WIP", href: "/dashboard/wip", icon: Hammer },
  { label: "Clients", href: "/dashboard/clients", icon: Users },
  { label: "Contractors", href: "/dashboard/contractors", icon: HardHat },
  { label: "Tenders", href: "/dashboard/tenders", icon: ClipboardList },
  { label: "Payment Schedules", href: "/dashboard/payment-schedules", icon: CalendarDays },
  { label: "Vehicle Log Book", href: "/dashboard/vehicle-log-book", icon: Car },
  { label: "Assets", href: "/dashboard/assets", icon: Box },
  { label: "In-Out Register", href: "/dashboard/in-out-register", icon: ArrowLeftRight },
  { label: "TADA Bills", href: "/dashboard/tada-bills", icon: ReceiptText },
  { label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                onSelect={() => {
                  router.push(item.href);
                  setOpen(false);
                }}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="AI">
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/fund-flow");
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Fund Flow insight
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/due-bills");
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Due Bills insight
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/wip");
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate WIP insight
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/contractors");
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Contractors insight
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/tenders");
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Tenders insight
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/payment-schedules");
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Payment Schedules insight
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/vehicle-log-book");
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Vehicle Log Book insight
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/assets");
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Assets insight
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/in-out-register");
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate In-Out Register insight
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings & Tools">
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/settings");
              setOpen(false);
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            Open Settings
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/settings");
              setOpen(false);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export / Import data
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/settings");
              setOpen(false);
            }}
          >
            <Bell className="mr-2 h-4 w-4" />
            Notification rules
          </CommandItem>
          <CommandItem
            onSelect={() => {
              router.push("/dashboard/settings");
              setOpen(false);
            }}
          >
            <Shield className="mr-2 h-4 w-4" />
            View audit log
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

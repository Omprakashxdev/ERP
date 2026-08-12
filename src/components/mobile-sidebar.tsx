"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogOut, Menu, X } from "lucide-react";
import { navGroups } from "@/lib/nav";
import { withBasePath } from "@/lib/base-path";

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function handleSignOut() {
    signOut({ callbackUrl: "/login" });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="lg:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-sidebar p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 px-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-0.5 shadow-sm overflow-hidden">
                  <img src={withBasePath("/saes-logo.jpg")} alt="SAEC Logo" className="h-full w-full rounded-lg object-cover" />
                </div>
                <div>
                  <div className="font-bold tracking-tight text-sidebar-foreground">SAEC ERP</div>
                  <div className="text-[10px] text-white/60">Enterprise Suite</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Separator className="mb-3" />
            <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                            isActive
                              ? "bg-white/15 text-white shadow-sm"
                              : "text-white/70 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-white" : "text-white/60"}`} />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <Separator className="my-4" />
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-white/70 hover:bg-white/10 hover:text-white"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </aside>
        </div>
      )}
    </>
  );
}

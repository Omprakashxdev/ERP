import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogOut } from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SidebarNav } from "@/components/sidebar-nav";
import { AiAssistant } from "@/components/ai-assistant";
import { withBasePath } from "@/lib/base-path";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full bg-background">
      {/* Desktop sidebar — kiosk style with grouped navigation */}
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar lg:flex">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-0.5 shadow-sm overflow-hidden">
            <img src={withBasePath("/saes-logo.jpg")} alt="SAEC Logo" className="h-full w-full rounded-lg object-cover" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-sidebar-foreground">
              SAEC ERP
            </div>
            <div className="text-[11px] text-white/60">
              Enterprise Suite
            </div>
          </div>
        </div>

        <Separator />

        {/* Navigation — client component with grouped sections */}
        <SidebarNav />

        <Separator />

        {/* User & Sign out */}
        <div className="px-3 py-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
              {session.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {session.user?.name ?? "User"}
              </p>
              <p className="truncate text-[11px] text-white/60">
                {session.user?.email}
              </p>
            </div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: withBasePath("/login") });
            }}
          >
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-white/70 hover:bg-white/10 hover:text-white"
              type="submit"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <CommandPalette />

      {/* Main content area */}
      <main className="flex-1 overflow-auto">
        {/* Top bar — clean, minimal */}
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <MobileSidebar />
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>

        {/* Page content with generous padding */}
        <div className="p-4 lg:p-6">{children}</div>
      </main>

      {/* AI Assistant — floating button + slide-in panel */}
      <AiAssistant />
    </div>
  );
}

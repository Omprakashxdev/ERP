"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "@/lib/actions/notifications";
import { Bell, Check, CheckCheck, Trash2, Loader2 } from "lucide-react";
import { NotificationPriority } from "@prisma/client";

interface NotificationItem {
  id: string;
  type: string;
  priority: NotificationPriority;
  title: string;
  message: string;
  module: string;
  entityId: string | null;
  entityName: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

function priorityColor(priority: NotificationPriority): string {
  switch (priority) {
    case "URGENT":
      return "text-red-700 bg-red-50";
    case "HIGH":
      return "text-orange-700 bg-orange-50";
    case "MEDIUM":
      return "text-amber-700 bg-amber-50";
    case "LOW":
      return "text-zinc-600 bg-zinc-50";
  }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  async function fetchNotifications() {
    setLoading(true);
    const result = await getNotifications(undefined, 1, 10);
    setLoading(false);
    if (result.success && result.data) {
      setNotifications(result.data.rows as NotificationItem[]);
      setUnreadCount(result.data.unreadCount);
    }
  }

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchNotifications();
    }
  }, []);

  async function handleMarkRead(id: string) {
    setActionLoading(id);
    await markNotificationRead(id);
    setActionLoading(null);
    fetchNotifications();
  }

  async function handleMarkAllRead() {
    setActionLoading("all");
    await markAllNotificationsRead();
    setActionLoading(null);
    fetchNotifications();
  }

  async function handleDelete(id: string) {
    setActionLoading(`del-${id}`);
    await deleteNotification(id);
    setActionLoading(null);
    fetchNotifications();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        onClick={() => {
          if (!fetchedRef.current) fetchNotifications();
        }}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAllRead}
              disabled={actionLoading === "all"}
            >
              {actionLoading === "all" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCheck className="mr-1 h-3 w-3" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-zinc-300" />
              <p className="mt-2 text-xs text-zinc-500">No notifications</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`border-b border-zinc-100 px-3 py-2.5 last:border-0 ${
                  !notif.isRead ? "bg-blue-50/40" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${priorityColor(notif.priority)}`}
                      >
                        {notif.priority}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {timeAgo(notif.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-zinc-900 truncate">
                      {notif.title}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">
                      {notif.message}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {!notif.isRead && (
                      <button
                        onClick={() => handleMarkRead(notif.id)}
                        disabled={actionLoading === notif.id}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        title="Mark as read"
                      >
                        {actionLoading === notif.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(notif.id)}
                      disabled={actionLoading === `del-${notif.id}`}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                      title="Delete"
                    >
                      {actionLoading === `del-${notif.id}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bell, BellOff, BellRing } from "lucide-react";
import { usePushNotifications } from "@/lib/usePushNotifications";
import type { AppNotification } from "@/lib/types";

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const push = usePushNotifications();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data ?? []) as AppNotification[]);
    setLoading(false);
  }

  async function markRead(id: string) {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);
    load();
  }

  async function markAllRead() {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("is_read", false);
    load();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
            <Bell className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        </div>
        <div className="flex items-center gap-2">
          {push.supported && (
            push.subscribed ? (
              <button
                onClick={() => push.unsubscribe()}
                className="text-xs px-3 py-2 rounded-lg bg-slate-100 text-slate-700 inline-flex items-center gap-1"
              >
                <BellOff className="w-4 h-4" /> Disable push
              </button>
            ) : (
              <button
                onClick={() => push.subscribe()}
                className="text-xs px-3 py-2 rounded-lg bg-brand-600 text-white inline-flex items-center gap-1 font-medium"
              >
                <BellRing className="w-4 h-4" /> Enable push
              </button>
            )
          )}
          <button
            onClick={markAllRead}
            className="text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700"
          >
            Mark all read
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-5xl mb-2">🔔</div>
          <p className="text-slate-700 font-medium">No notifications</p>
          <p className="text-sm text-slate-500 mt-1">You&apos;re all caught up.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              className={`p-4 cursor-pointer hover:bg-slate-50 ${!n.is_read ? "bg-blue-50/50" : ""}`}
            >
              <div className="flex items-start gap-3">
                {!n.is_read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{n.title}</div>
                  {n.body && <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>}
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

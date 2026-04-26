"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageCircle, Send, Loader2 } from "lucide-react";

interface MessageRow {
  id: string;
  phone: string;
  message: string;
  direction: string;
  status: string;
  created_at: string;
  hcps: { full_name: string } | null;
}

export default function WhatsAppPage() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("*, hcps(full_name)")
      .order("created_at", { ascending: false })
      .limit(50);
    setMessages((data ?? []) as unknown as MessageRow[]);
    setLoading(false);
  }

  async function send() {
    if (!phone || !message) return;
    setSending(true);
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`
      },
      body: JSON.stringify({ phone, message })
    });
    const j = await res.json();
    setSending(false);
    if (j.ok) {
      window.open(j.wa_url, "_blank");
      setMessage("");
      load();
    } else {
      alert("Failed: " + (j.error ?? "unknown"));
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
          <MessageCircle className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">WhatsApp</h1>
      </div>
      <p className="text-slate-500 mb-4">
        Quick-send to HCPs via WhatsApp. Each message is logged for audit.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Phone (with country code)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+201234567890"
            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Type your message…"
            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <button
          onClick={send}
          disabled={sending || !phone || !message}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium py-2 rounded-lg inline-flex items-center justify-center gap-2"
        >
          {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</> : <><Send className="w-4 h-4" /> Open in WhatsApp</>}
        </button>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-2">Recent messages</h2>
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">Loading…</div>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
          No messages yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {messages.map((m) => (
            <div key={m.id} className="p-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900">{m.hcps?.full_name ?? m.phone}</span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {m.direction === "out" ? "→ sent" : "← received"}
                </span>
                <span className="text-xs text-slate-500 ml-auto">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-slate-700 mt-1">{m.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

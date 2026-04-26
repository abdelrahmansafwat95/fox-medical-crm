"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Sparkles, Send, Loader2, Mail, MessageCircle, Megaphone, Shield } from "lucide-react";

const MODES = [
  { id: "free", label: "Free chat", icon: Sparkles },
  { id: "email", label: "Email writer", icon: Mail },
  { id: "whatsapp", label: "WhatsApp message", icon: MessageCircle },
  { id: "pitch", label: "Detailing pitch", icon: Megaphone },
  { id: "objection", label: "Objection handler", icon: Shield }
];

export default function AssistantPage() {
  const [mode, setMode] = useState("free");
  const [language, setLanguage] = useState("en");
  const [context, setContext] = useState("");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!prompt.trim()) return;
    setBusy(true);
    setReply("");
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/ai/assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`
      },
      body: JSON.stringify({ mode, context, prompt, language })
    });
    const j = await res.json();
    setBusy(false);
    if (j.ok) {
      setReply(j.reply);
    } else {
      setReply("Error: " + (j.error ?? "unknown"));
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-yellow-50 text-yellow-700">
          <Sparkles className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">AI Assistant</h1>
      </div>
      <p className="text-slate-500 mb-4">
        Powered by Claude. Write emails, WhatsApp messages, detailing pitches, or get advice.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`text-sm px-3 py-2 rounded-lg inline-flex items-center gap-1.5 transition ${
                mode === m.id
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {m.label}
            </button>
          );
        })}
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="text-sm px-3 py-2 border border-slate-300 rounded-lg ml-auto"
        >
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Context (optional)
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Doctor is a cardiologist at Cleopatra Hospital, prescribes our competitor heavily..."
            rows={2}
            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Your task or question
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Write a follow-up email after a successful detailing visit..."
            rows={3}
            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <button
          onClick={send}
          disabled={busy || !prompt.trim()}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium py-2.5 rounded-lg inline-flex items-center justify-center gap-2"
        >
          {busy ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
          ) : (
            <><Send className="w-4 h-4" /> Generate</>
          )}
        </button>
      </div>

      {reply && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-yellow-700" />
            <span className="font-semibold text-yellow-900">Claude says</span>
            <button
              onClick={() => navigator.clipboard.writeText(reply)}
              className="ml-auto text-xs text-yellow-700 underline"
            >
              Copy
            </button>
          </div>
          <pre
            className="whitespace-pre-wrap text-sm text-slate-800 font-sans"
            dir={language === "ar" ? "rtl" : "ltr"}
          >
            {reply}
          </pre>
        </div>
      )}
    </div>
  );
}

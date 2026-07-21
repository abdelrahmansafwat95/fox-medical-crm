"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Settings, User, BellRing, Loader2, Check, Database, Lock } from "lucide-react";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { useRole } from "@/lib/roles";
import { seedDemoData } from "@/lib/demoSeed";

export default function SettingsPage() {
  const [profile, setProfile] = useState<{
    full_name: string;
    full_name_ar: string;
    phone: string;
    product_line: string;
  }>({ full_name: "", full_name_ar: "", phone: "", product_line: "" });
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const push = usePushNotifications();
  const { role } = useRole();
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function changePassword() {
    setPwMsg(null);
    if (newPass.length < 8) {
      setPwMsg("Password must be at least 8 characters.");
      return;
    }
    if (newPass !== confirmPass) {
      setPwMsg("Passwords don't match.");
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setPwSaving(false);
    if (error) {
      setPwMsg("Failed: " + error.message);
      return;
    }
    setNewPass("");
    setConfirmPass("");
    setPwMsg("Password updated.");
  }

  async function loadDemo() {
    if (!confirm("Load a demo dataset (8 institutions, 20 HCPs, 8 products, ~24 visits)? This adds records to your database.")) return;
    setSeeding(true);
    setSeedMsg(null);
    try {
      const r = await seedDemoData();
      setSeedMsg(`Added ${r.institutions} institutions, ${r.hcps} HCPs, ${r.products} products, ${r.visits} visits.`);
    } catch (e) {
      setSeedMsg("Failed: " + (e instanceof Error ? e.message : "unknown error"));
    } finally {
      setSeeding(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, full_name_ar, phone, product_line")
        .eq("id", u.user.id)
        .single();
      if (p) {
        setProfile({
          full_name: p.full_name ?? "",
          full_name_ar: p.full_name_ar ?? "",
          phone: p.phone ?? "",
          product_line: p.product_line ?? ""
        });
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return;
    }
    await supabase
      .from("profiles")
      .update({
        full_name: profile.full_name,
        full_name_ar: profile.full_name_ar || null,
        phone: profile.phone || null,
        product_line: profile.product_line || null
      })
      .eq("id", u.user.id);
    setSaving(false);
    setSavedAt(new Date());
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
          <Settings className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      </div>
      <p className="text-slate-500 mb-4">Your profile and notification preferences.</p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Profile</h2>
        </div>
        <div className="space-y-3">
          <Field label="Email" value={email} disabled />
          <Field
            label="Full name"
            value={profile.full_name}
            onChange={(v) => setProfile({ ...profile, full_name: v })}
          />
          <Field
            label="Full name (Arabic)"
            value={profile.full_name_ar}
            onChange={(v) => setProfile({ ...profile, full_name_ar: v })}
            dir="rtl"
          />
          <Field
            label="Phone"
            value={profile.phone}
            onChange={(v) => setProfile({ ...profile, phone: v })}
          />
          <Field
            label="Product line"
            value={profile.product_line}
            onChange={(v) => setProfile({ ...profile, product_line: v })}
            placeholder="e.g. Cardio-Metabolic"
          />
          <button
            onClick={save}
            disabled={saving}
            className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium px-5 py-2 rounded-lg inline-flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save"}
          </button>
          {savedAt && (
            <span className="text-xs text-emerald-700 inline-flex items-center gap-1 ml-2">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <BellRing className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Push notifications</h2>
        </div>
        {!push.supported ? (
          <p className="text-sm text-slate-500">Your browser doesn&apos;t support push notifications.</p>
        ) : push.subscribed ? (
          <div>
            <p className="text-sm text-emerald-700 mb-2">✓ Push notifications enabled on this device.</p>
            <button
              onClick={() => push.unsubscribe()}
              className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg"
            >
              Disable
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-600 mb-2">Get notified about flagged visits, approvals, and reminders.</p>
            <button
              onClick={() => push.subscribe()}
              className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              Enable push notifications
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Change password</h2>
        </div>
        <div className="space-y-3 max-w-sm">
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="New password"
            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
          />
          <input
            type="password"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            placeholder="Confirm new password"
            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={changePassword}
              disabled={pwSaving || !newPass}
              className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium px-5 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
            >
              {pwSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</> : "Update password"}
            </button>
            {pwMsg && <span className="text-xs text-slate-600">{pwMsg}</span>}
          </div>
        </div>
      </div>

      {role === "admin" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-900">Demo data</h2>
          </div>
          <p className="text-sm text-slate-600 mb-3">
            Populate this instance with realistic sample institutions, HCPs, products, and
            visits so you can explore or demo the app on a fresh database.
          </p>
          <button
            onClick={loadDemo}
            disabled={seeding}
            className="text-sm bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white px-4 py-2 rounded-lg font-medium inline-flex items-center gap-2"
          >
            {seeding ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </>
            ) : (
              "Load demo data"
            )}
          </button>
          {seedMsg && <p className="text-xs text-slate-600 mt-2">{seedMsg}</p>}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  dir,
  placeholder
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  dir?: "ltr" | "rtl";
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        dir={dir}
        placeholder={placeholder}
        className="w-full p-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500"
      />
    </div>
  );
}

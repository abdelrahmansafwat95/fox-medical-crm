"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { clearRoleCache } from "@/lib/roles";
import { Mail, Lock, Loader2, Languages } from "lucide-react";

const t = {
  en: {
    title: "FoxSystems Medical CRM",
    tagline: "GPS-verified field force management for pharma",
    welcome: "Welcome back",
    subtitle: "Sign in to access your dashboard",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    invalidCreds: "Invalid email or password.",
    placeholderEmail: "you@company.com",
    placeholderPassword: "••••••••",
    poweredBy: "Powered by FoxSystems Tech"
  },
  ar: {
    title: "فوكس سيستمز - نظام إدارة المبيعات الطبية",
    tagline: "نظام تتبع المندوبين الطبيين بـ GPS",
    welcome: "أهلاً بعودتك",
    subtitle: "سجّل الدخول للوصول إلى لوحة التحكم",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ تسجيل الدخول…",
    invalidCreds: "بريد إلكتروني أو كلمة مرور غير صحيحة.",
    placeholderEmail: "you@company.com",
    placeholderPassword: "••••••••",
    poweredBy: "مقدم من FoxSystems Tech"
  }
};

export default function LoginPage() {
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user already signed in, bounce to dashboard.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/dashboard");
    })();
  }, [router]);

  // Update <html dir/lang> when toggle changes.
  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  const L = t[lang];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setLoading(false);
    if (error) {
      setError(L.invalidCreds);
      return;
    }
    clearRoleCache(); // ensure the new user's role is fetched fresh
    router.replace("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-br from-brand-50 via-white to-brand-100">
      {/* Top bar with language toggle */}
      <div className="flex justify-end p-4">
        <button
          onClick={() => setLang(lang === "en" ? "ar" : "en")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white shadow-sm border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Languages className="w-4 h-4" />
          {lang === "en" ? "العربية" : "English"}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-3">🦊💊</div>
            <h1 className="text-2xl font-bold text-slate-900">{L.title}</h1>
            <p className="text-sm text-slate-500 mt-1">{L.tagline}</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900">{L.welcome}</h2>
            <p className="text-sm text-slate-500 mb-6">{L.subtitle}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {L.email}
                </label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={L.placeholderEmail}
                    className="w-full ps-10 pe-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {L.password}
                </label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={L.placeholderPassword}
                    className="w-full ps-10 pe-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition"
                    dir="ltr"
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {L.signingIn}
                  </>
                ) : (
                  L.signIn
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            {L.poweredBy} · foxsystemstech.com
          </p>
        </div>
      </div>
    </main>
  );
}

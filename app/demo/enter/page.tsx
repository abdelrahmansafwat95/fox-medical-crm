"use client";

/**
 * Where a website visitor lands from foxsystemstech.com's "Try the live demo".
 *
 * The demo-signup Edge Function made them a demo login and a one-time
 * magic-link token; spending it here signs them in (the SDK persists the
 * session to localStorage like a normal login) and the dashboard takes over.
 *
 * The token is read from window.location rather than useSearchParams, which
 * would force a Suspense boundary for the static build.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { clearRoleCache } from "@/lib/roles";
import { clearPermsCache } from "@/lib/permissions";
import { Loader2 } from "lucide-react";

const WEBSITE_DEMO = "https://foxsystemstech.com/solutions/medical-crm";

export default function DemoEnterPage() {
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const l = params.get("lang") === "ar" ? "ar" : "en";
    setLang(l);
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = l;

    const tokenHash = params.get("token_hash");
    if (!tokenHash) {
      setFailed(true);
      return;
    }
    (async () => {
      // A previous user's cached role or permissions must not carry over.
      clearRoleCache();
      clearPermsCache();
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error || !data.session) {
        setFailed(true);
        return;
      }
      router.replace("/dashboard?demo=welcome");
    })();
  }, [router]);

  const isAr = lang === "ar";
  const back = isAr ? WEBSITE_DEMO.replace(".com/", ".com/ar/") : WEBSITE_DEMO;

  return (
    <main className="login-bg min-h-screen flex items-center justify-center p-6">
      <div className="text-center text-white max-w-sm">
        {failed ? (
          <>
            <p className="mb-3">
              {isAr
                ? "انتهت صلاحية رابط الدخول هذا أو استُخدم من قبل."
                : "This sign-in link has expired or was already used."}
            </p>
            <a href={`${back}?demo=expired#demo`} className="underline text-cyan-300">
              {isAr ? "اطلب رابطًا جديدًا" : "Request a new one"}
            </a>
          </>
        ) : (
          <>
            <Loader2 className="w-7 h-7 animate-spin mx-auto mb-4 text-cyan-300" />
            <p>{isAr ? "جارٍ فتح النسخة التجريبية…" : "Opening your demo…"}</p>
          </>
        )}
      </div>
    </main>
  );
}

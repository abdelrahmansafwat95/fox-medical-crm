"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      router.replace(data.session ? "/dashboard" : "/login");
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-3">🦊💊</div>
        <p className="text-slate-500">Loading FoxSystems Medical…</p>
      </div>
    </div>
  );
}

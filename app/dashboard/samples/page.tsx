"use client";

import { Package } from "lucide-react";

export default function Page() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
          <Package className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Samples</h1>
      </div>
      <p className="text-slate-500 mb-6">Inventory & distribution — built in Step 7</p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
        <div className="text-5xl mb-4">🚧</div>
        <h2 className="font-semibold text-slate-900">Coming up in the next step</h2>
        <p className="text-sm text-slate-500 mt-2">
          This page will be wired up to your Supabase data once we get there.
        </p>
      </div>
    </div>
  );
}

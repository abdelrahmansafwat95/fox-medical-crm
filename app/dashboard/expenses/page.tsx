"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Receipt, Plus, Loader2 } from "lucide-react";

interface ExpenseRow {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-emerald-100 text-emerald-700"
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    category: "transport",
    amount: "",
    description: ""
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .limit(50);
    setExpenses((data ?? []) as ExpenseRow[]);
    setLoading(false);
  }

  async function submitExpense() {
    if (!form.amount) return;
    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSubmitting(false);
      return;
    }
    await supabase.from("expenses").insert({
      rep_id: u.user.id,
      expense_date: form.expense_date,
      category: form.category,
      amount: parseFloat(form.amount),
      currency: "EGP",
      description: form.description || null,
      status: "submitted"
    });
    setForm({ expense_date: new Date().toISOString().slice(0, 10), category: "transport", amount: "", description: "" });
    setShowForm(false);
    setSubmitting(false);
    load();
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-50 text-orange-700">
            <Receipt className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" /> New expense
        </button>
      </div>
      <p className="text-slate-500 mb-4">Daily expenses — transport, fuel, meals, etc.</p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="text-xs text-slate-500">Total this month</div>
        <div className="text-2xl font-bold text-slate-900">{total.toLocaleString()} EGP</div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              >
                {["transport","fuel","meal","parking","toll","phone","accommodation","other"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Amount (EGP)</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              placeholder="e.g. Uber to Maadi clinic"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={submitExpense}
              disabled={!form.amount || submitting}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-medium py-2 rounded-lg inline-flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Submit"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">Loading…</div>
      ) : expenses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-5xl mb-2">🧾</div>
          <p className="text-slate-700 font-medium">No expenses yet</p>
          <p className="text-sm text-slate-500 mt-1">Submit your first expense above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {expenses.map((e) => (
            <div key={e.id} className="p-3 flex items-center gap-3 text-sm">
              <span className="text-[11px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-700 capitalize w-24 text-center">
                {e.category}
              </span>
              <div className="flex-1">
                <div className="font-medium text-slate-900">{e.description ?? "—"}</div>
                <div className="text-xs text-slate-500">{e.expense_date}</div>
              </div>
              <div className="font-bold">{e.amount.toLocaleString()} EGP</div>
              <span className={`text-[11px] font-bold px-2 py-1 rounded ${STATUS_COLORS[e.status]}`}>
                {e.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

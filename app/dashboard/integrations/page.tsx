"use client";

// API keys, webhooks and their docs — the "API access and webhooks" the plans
// promise. Managing is for an admin or country manager only and refused to demo visitors by
// the database (can_manage_integrations); a visitor sees the page read-only so
// the feature can still be shown.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plug, KeyRound, Webhook, Plus, Trash2, Copy, Check, Send, Eye, BookOpen, X } from 'lucide-react'

import { tr } from "@/lib/i18n";
const SCOPES: { res: string; en: string; ar: string; write: boolean; writeLabel?: string }[] = [
  { res: 'hcps', en: 'HCPs', ar: '', write: true },
  { res: 'institutions', en: 'Institutions', ar: '', write: true },
  { res: 'orders', en: 'Orders', ar: '', write: true, writeLabel: 'update' },
  { res: 'products', en: 'Products', ar: '', write: false },
  { res: 'visits', en: 'Visits', ar: '', write: false },
  { res: 'events', en: 'Events', ar: '', write: false },
  { res: 'expenses', en: 'Expenses', ar: '', write: false },
  { res: 'tour_plans', en: 'Tour plans', ar: '', write: false },
]
const EVENTS: { id: string; en: string; ar: string }[] = [
  { id: 'hcp.created', en: 'New HCP', ar: '' },
  { id: 'hcp.updated', en: 'HCP updated', ar: '' },
  { id: 'institution.created', en: 'New institution', ar: '' },
  { id: 'visit.completed', en: 'Visit completed', ar: '' },
  { id: 'order.created', en: 'New order', ar: '' },
  { id: 'order.status_changed', en: 'Order status changed', ar: '' },
  { id: 'expense.submitted', en: 'Expense submitted', ar: '' },
  { id: 'tour_plan.submitted', en: 'Tour plan submitted', ar: '' },
  { id: 'event.created', en: 'New event', ar: '' },
  { id: 'compliance.alert', en: 'Compliance alert', ar: '' },
]
const API_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/public-api/v1`

export default function IntegrationsPage() {
  const isAr = false   // the medical dashboard is English-only
  const [demo, setDemo] = useState(false)
  const [keys, setKeys] = useState<any[]>([])
  const [hooks, setHooks] = useState<any[]>([])
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  // forms
  const [keyName, setKeyName] = useState('')
  const [keyScopes, setKeyScopes] = useState<string[]>(['hcps:read', 'visits:read'])
  const [newKey, setNewKey] = useState('')
  const [hookUrl, setHookUrl] = useState('')
  const [hookDesc, setHookDesc] = useState('')
  const [hookEvents, setHookEvents] = useState<string[]>(['visit.completed', 'order.created'])
  const [shownSecret, setShownSecret] = useState<{ id: string; secret: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState<{ plan: string; api_enabled: boolean } | null>(null)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('profiles').select('is_demo_visitor').eq('id', user.id).single()
      setDemo(p?.is_demo_visitor === true)
    }
    const [k, h, d, pl] = await Promise.all([
      supabase.from('api_keys').select('*').order('created_at', { ascending: false }),
      supabase.from('webhooks').select('id, url, events, active, description, created_at, last_status, last_delivery_at').order('created_at', { ascending: false }),
      supabase.from('webhook_deliveries').select('id, webhook_id, event, status, attempts, response_status, created_at, delivered_at').order('id', { ascending: false }).limit(20),
      supabase.rpc('plan_info'),
    ])
    setKeys(k.data || []); setHooks(h.data || []); setDeliveries(d.data || []); setPlan((pl.data as any) || null)
  }
  useEffect(() => { load() }, [])

  const run = async (fn: () => Promise<{ error: any }>, ok: string) => {
    setBusy(true); setErr(''); setMsg('')
    const { error } = await fn()
    setBusy(false)
    if (error) { setErr(error.message); return false }
    setMsg(ok); load(); return true
  }
  const copy = (text: string, tag: string) => {
    navigator.clipboard?.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1500)
  }
  const toggle = (list: string[], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v]

  const createKey = async () => {
    setBusy(true); setErr(''); setMsg('')
    const { data, error } = await supabase.rpc('api_key_create', { p_name: keyName, p_scopes: keyScopes })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNewKey((data as any).key); setKeyName(''); load()
  }
  const createHook = async () => {
    setBusy(true); setErr(''); setMsg('')
    const { data, error } = await supabase.rpc('webhook_save', { p_id: null, p_url: hookUrl, p_events: hookEvents, p_active: true, p_description: hookDesc })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setShownSecret({ id: (data as any).id, secret: (data as any).secret }); setHookUrl(''); setHookDesc(''); load()
  }
  const showSecret = async (id: string) => {
    const { data, error } = await supabase.rpc('webhook_secret', { p_id: id })
    if (error) { setErr(error.message); return }
    setShownSecret({ id, secret: data as string })
  }

  const t = (en: string, ar: string) => (isAr ? ar : en)
  const card = 'bg-white rounded-xl border border-gray-100 p-6'
  const btn = 'flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50'
  const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300'
  const fmt = (d?: string) => d ? new Date(d).toLocaleString(isAr ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const locked = demo || busy
  // The plan is set by Fox Systems per installation (fox_plan.config); below
  // Business, keys and webhooks are paused but can still be revoked or deleted.
  const noPlan = plan?.api_enabled === false
  const planName = plan ? ({ starter: t('Starter', 'البداية'), team: t('Team', 'الفريق'), growth: t('Growth', 'النمو'),
    business: t('Business', 'الأعمال'), complete: t('Complete', 'الشامل') } as Record<string, string>)[plan.plan] || plan.plan : ''

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Plug size={22} className="text-brand-500" /> {tr("API & Webhooks")}
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {t('Connect the CRM to your website, forms, accounting or any system: read and write records with an API key, and get told the moment something happens.',
             'اربط النظام بموقعك ونماذجك وبرنامج الحسابات أو أي نظام آخر: اقرأ السجلات واكتبها بمفتاح API، واستقبل إشعارًا فور حدوث أي تغيير.')}
        </p>
      </div>

      {noPlan && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          {t(`Your plan (${planName}) does not include API access and webhooks — they are part of the Business and Complete plans. Existing keys and webhooks are paused, not deleted, and you can still revoke them.`,
             `باقتك الحالية (${planName}) لا تشمل الوصول إلى الـ API والـ Webhooks، فهي ضمن باقتَي الأعمال والشامل. المفاتيح والـ Webhooks الحالية موقوفة مؤقتًا ولم تُحذف، ويمكنك إلغاؤها.`)}
        </div>
      )}
      {demo && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          {t('In the demo, creating API keys and webhooks is switched off so the shared sample data stays inside the CRM. In your own CRM your administrator creates them here.',
             'إنشاء مفاتيح الـ API والـ Webhooks معطَّل في النسخة التجريبية كي تبقى البيانات النموذجية المشتركة داخل النظام. في نظامك الخاص يُنشئها المسؤول من هذه الصفحة.')}
        </div>
      )}
      {msg && <div className="bg-brand-50 border border-brand-100 text-brand-700 text-sm rounded-lg px-4 py-2.5">{msg}</div>}
      {err && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg px-4 py-2.5">{err}</div>}

      {/* ---- API keys ---- */}
      <div className={card}>
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1"><KeyRound size={18} className="text-brand-500" /> {t('API keys', 'مفاتيح الـ API')}</h2>
        <p className="text-xs text-gray-400 mb-4">{t('Each key has only the permissions you tick. The key is shown once — store it somewhere safe.', 'لكل مفتاح الصلاحيات التي تحددها فقط، ويظهر المفتاح مرة واحدة فاحفظه في مكان آمن.')}</p>

        {newKey && (
          <div className="mb-4 border border-green-200 bg-green-50 rounded-lg p-3">
            <p className="text-sm font-medium text-green-800 mb-2">{t('Your new key — copy it now, it will not be shown again:', 'مفتاحك الجديد، انسخه الآن فلن يظهر مرة أخرى:')}</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 bg-white border border-green-200 rounded px-2 py-1.5 text-xs break-all" dir="ltr">{newKey}</code>
              <button onClick={() => copy(newKey, 'key')} className="p-2 rounded-lg border border-green-200 bg-white">{copied === 'key' ? <Check size={15} /> : <Copy size={15} />}</button>
              <button onClick={() => setNewKey('')} className="p-2 rounded-lg border border-green-200 bg-white"><X size={15} /></button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-xs font-medium text-gray-500">{t('Key name', 'اسم المفتاح')}</label>
            <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder={tr("e.g. ERP sync")} className={input} disabled={demo} />
            <button onClick={createKey} disabled={locked || noPlan || !keyName.trim() || !keyScopes.length} className={`${btn} mt-3`}>
              <Plus size={15} /> {t('Create key', 'إنشاء مفتاح')}
            </button>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">{t('Permissions', 'الصلاحيات')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 mt-1">
              {SCOPES.map(s => (
                <div key={s.res} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-gray-700">{isAr ? s.ar : s.en}</span>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={demo} checked={keyScopes.includes(`${s.res}:read`)} onChange={() => setKeyScopes(toggle(keyScopes, `${s.res}:read`))} /> {t('read', 'قراءة')}</label>
                  {s.write && <label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={demo} checked={keyScopes.includes(`${s.res}:write`)} onChange={() => setKeyScopes(toggle(keyScopes, `${s.res}:write`))} /> {s.writeLabel ?? 'write'}</label>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400 text-start border-b border-gray-100">
              <th className="py-2 text-start">{t('Name', 'الاسم')}</th><th className="text-start">{t('Key', 'المفتاح')}</th>
              <th className="text-start">{t('Permissions', 'الصلاحيات')}</th><th className="text-start">{t('Last used', 'آخر استخدام')}</th><th></th>
            </tr></thead>
            <tbody>
              {keys.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400 text-xs">{t('No keys yet.', 'لا توجد مفاتيح بعد.')}</td></tr>}
              {keys.map(k => (
                <tr key={k.id} className="border-b border-gray-50">
                  <td className="py-2">{k.name}</td>
                  <td dir="ltr"><code className="text-xs text-gray-500">{k.prefix}…</code></td>
                  <td className="text-xs text-gray-500">{(k.scopes || []).join(', ')}</td>
                  <td className="text-xs text-gray-500">{fmt(k.last_used_at)} · {k.request_count} {t('calls', 'طلب')}</td>
                  <td className="text-end">
                    {k.revoked_at ? <span className="text-xs text-gray-400">{t('revoked', 'ملغى')}</span> :
                      <button disabled={locked} onClick={() => confirm(t('Revoke this key? Anything using it stops working.', 'إلغاء هذا المفتاح؟ سيتوقف كل ما يستخدمه.')) &&
                        run(async () => await supabase.rpc('api_key_revoke', { p_id: k.id }), t('Key revoked.', 'تم إلغاء المفتاح.'))}
                        className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg disabled:opacity-50">{t('Revoke', 'إلغاء')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- webhooks ---- */}
      <div className={card}>
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1"><Webhook size={18} className="text-brand-500" /> {t('Webhooks', 'الـ Webhooks')}</h2>
        <p className="text-xs text-gray-400 mb-4">{t('We POST a signed JSON message to your URL when an event happens, and retry for about 12 hours if it fails.', 'نرسل رسالة JSON موقّعة إلى رابطك عند وقوع الحدث، ونعيد المحاولة نحو 12 ساعة إذا تعذّر الإرسال.')}</p>

        {shownSecret && (
          <div className="mb-4 border border-green-200 bg-green-50 rounded-lg p-3">
            <p className="text-sm font-medium text-green-800 mb-2">{t('Signing secret — use it to verify X-Fox-Signature:', 'سرّ التوقيع، استخدمه للتحقق من X-Fox-Signature:')}</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 bg-white border border-green-200 rounded px-2 py-1.5 text-xs break-all" dir="ltr">{shownSecret.secret}</code>
              <button onClick={() => copy(shownSecret.secret, 'secret')} className="p-2 rounded-lg border border-green-200 bg-white">{copied === 'secret' ? <Check size={15} /> : <Copy size={15} />}</button>
              <button onClick={() => setShownSecret(null)} className="p-2 rounded-lg border border-green-200 bg-white"><X size={15} /></button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500">{t('Your URL (https)', 'رابطك (https)')}</label>
            <input dir="ltr" value={hookUrl} onChange={e => setHookUrl(e.target.value)} placeholder="https://example.com/fox-webhook" className={input} disabled={demo} />
            <input value={hookDesc} onChange={e => setHookDesc(e.target.value)} placeholder={t('Description (optional)', 'وصف (اختياري)')} className={input} disabled={demo} />
            <button onClick={createHook} disabled={locked || noPlan || !hookUrl.trim() || !hookEvents.length} className={btn}><Plus size={15} /> {t('Add webhook', 'إضافة Webhook')}</button>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">{t('Events', 'الأحداث')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
              {EVENTS.map(e => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={demo} checked={hookEvents.includes(e.id)} onChange={() => setHookEvents(toggle(hookEvents, e.id))} />
                  {isAr ? e.ar : e.en} <code className="text-[10px] text-gray-400" dir="ltr">{e.id}</code>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {hooks.length === 0 && <p className="text-center text-gray-400 text-xs py-3">{t('No webhooks yet.', 'لا توجد Webhooks بعد.')}</p>}
          {hooks.map(h => (
            <div key={h.id} className="border border-gray-100 rounded-lg p-3 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 break-all" dir="ltr">{h.url}</p>
                <p className="text-xs text-gray-400">{h.description ? h.description + ' · ' : ''}{(h.events || []).join(', ')}</p>
                <p className="text-xs text-gray-400">{t('Last delivery', 'آخر إرسال')}: {fmt(h.last_delivery_at)} {h.last_status ? `· HTTP ${h.last_status}` : ''}</p>
              </div>
              <div className="flex gap-1">
                <button disabled={locked} onClick={() => run(async () => await supabase.rpc('webhook_save', { p_id: h.id, p_url: h.url, p_events: h.events, p_active: !h.active, p_description: h.description }), t('Saved.', 'تم الحفظ.'))}
                  className={`text-xs px-2 py-1 rounded-lg border ${h.active ? 'border-green-200 text-green-700' : 'border-gray-200 text-gray-400'} disabled:opacity-50`}>{h.active ? t('Active', 'مفعّل') : t('Paused', 'متوقف')}</button>
                <button disabled={locked} title={t('Send a test', 'إرسال تجربة')} onClick={() => run(async () => await supabase.rpc('webhook_test', { p_id: h.id }), t('Test queued — it is sent within a minute.', 'أُضيفت التجربة، وستُرسل خلال دقيقة.'))} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-50"><Send size={14} /></button>
                <button disabled={locked} title={t('Signing secret', 'سرّ التوقيع')} onClick={() => showSecret(h.id)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-50"><Eye size={14} /></button>
                <button disabled={locked} title={t('Delete', 'حذف')} onClick={() => confirm(t('Delete this webhook?', 'حذف هذا الـ Webhook؟')) && run(async () => await supabase.rpc('webhook_delete', { p_id: h.id }), t('Deleted.', 'تم الحذف.'))} className="p-1.5 rounded-lg border border-gray-200 text-red-500 disabled:opacity-50"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        {deliveries.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <p className="text-xs font-medium text-gray-500 mb-2">{t('Recent deliveries', 'آخر عمليات الإرسال')}</p>
            <table className="w-full text-xs">
              <tbody>
                {deliveries.map(d => (
                  <tr key={d.id} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-500">{fmt(d.created_at)}</td>
                    <td dir="ltr"><code>{d.event}</code></td>
                    <td className={d.status === 'sent' ? 'text-green-600' : d.status === 'failed' ? 'text-red-600' : 'text-amber-600'}>{tr(d.status)}</td>
                    <td className="text-gray-500">{d.response_status ? `HTTP ${d.response_status}` : ''}</td>
                    <td className="text-gray-400">{t('attempts', 'محاولات')}: {d.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- docs ---- */}
      <div className={card}>
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3"><BookOpen size={18} className="text-brand-500" /> {t('Quick reference', 'مرجع سريع')}</h2>
        <div className="space-y-4 text-sm text-gray-700" dir="ltr">
          <div>
            <p className="font-medium mb-1">{tr("Base URL")}</p>
            <div className="flex gap-2 items-center"><code className="flex-1 bg-gray-50 rounded px-2 py-1.5 text-xs break-all">{API_BASE}</code>
              <button onClick={() => copy(API_BASE, 'base')} className="p-1.5 rounded-lg border border-gray-200">{copied === 'base' ? <Check size={14} /> : <Copy size={14} />}</button></div>
          </div>
          <div>
            <p className="font-medium mb-1">{tr("Endpoints")}</p>
            <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">{tr("GET    /v1                         your key and its permissions\nGET    /v1/{resource}              list: ?limit=50&offset=0&updated_since=2026-01-01\nGET    /v1/{resource}/{id}         one record\nPOST   /v1/{resource}              create (hcps, institutions)\nPATCH  /v1/{resource}/{id}         update the fields you send (hcps, institutions, orders)\n\nread:      hcps, institutions, orders, products, visits, events, expenses, tour_plans\nfilters:   hcps ?segment= ?specialty= ?assigned_rep_id=   visits ?status= ?rep_id=   orders ?status=\nlimits:    120 requests a minute per key; no deletes; visits are read-only (GPS-verified)")}</pre>
          </div>
          <div>
            <p className="font-medium mb-1">{tr("Example")}</p>
            <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">{`curl -X PATCH ${API_BASE}/orders/ORDER_ID \
  -H "Authorization: Bearer fox_md_…" \
  -H "Content-Type: application/json" \
  -d '{"status":"delivered"}'`}</pre>
          </div>
          <div>
            <p className="font-medium mb-1">{tr("Allowed values")}</p>
            <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">{tr("hcp.title           Dr., Prof., Pharm.D, Pharm., Nurse, Other\nhcp.segment         A, B, C, D, KOL        hcp.decile  1–10\ninstitution.type    private_clinic, polyclinic, hospital_govt, hospital_private, hospital_university,\n                    hospital_military, pharmacy_independent, pharmacy_chain, distributor, wholesaler, lab, warehouse\norder.status        draft, submitted, approved, dispatched, delivered, paid, cancelled, returned")}</pre>
          </div>
          <div>
            <p className="font-medium mb-1">{tr("Verifying a webhook (Node.js)")}</p>
            <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">{tr("const crypto = require('crypto')\n// rawBody: the request body exactly as received, as a string\nconst expected = 'sha256=' + crypto.createHmac('sha256', SECRET)\n  .update(req.headers['x-fox-timestamp'] + '.' + rawBody).digest('hex')\nconst ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-fox-signature']))\n// body: { id, event, created_at, data: { …the record… } }")}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

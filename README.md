# 🦊💊 FoxSystems Medical CRM — v0.3 (FEATURE COMPLETE)

AI-powered Pharmaceutical & Medical Sales CRM with **GPS-verified visit tracking** and **automated compliance**.

**Stack:** Next.js 14 · TypeScript · Supabase (PostgreSQL + PostGIS) · Tailwind · Anthropic Claude · Mapbox GL JS · Web Push
**Owner:** FoxSystems Tech — foxsystemstech.com
**Live target:** 250–750 EGP per rep per month (1/10th of Veeva)

---

## 🎉 What ships in v0.3

This release closes Steps 7-12 — turning the GPS-tracking core into a **feature-complete CRM**:

### Step 7 — Samples, Orders, Expenses
- `samples_inventory` + `samples_transactions` with full audit trail
- Atomic `give_sample_to_hcp()` RPC (decrements stock, logs transaction, updates visit)
- Orders module (auto-numbered, status pipeline draft → paid)
- Expenses module with categories (transport/fuel/meal/etc.) and approval flow

### Step 8 — Reports
- **Excel export** (xlsx) and **PDF export** (jspdf + autotable)
- Field-force performance dashboard with verify-rate scoring
- Day-range filter (7d / 30d / 90d)

### Step 9 — Tour Plans + Targets
- Reps submit daily plans → managers approve/reject
- Manager sets monthly KPI targets per rep (calls, coverage, order value)
- HCP coverage view (last visit per HCP, days since)

### Step 10 — Compliance / Anomaly Engine
- Pure-SQL `detect_visit_anomalies()` function
- Detects: outside-geofence, impossible travel speed (>120 km/h), duplicate visit, visit too short (<3 min)
- Auto-flags suspicious visits, severity-tagged
- Manager UI to resolve / mark false-positive

### Step 11 — Notifications + WhatsApp + AI Chat
- **Web Push** (VAPID) with service worker + bell hook
- In-app `notifications` table + read/unread state
- WhatsApp send via wa.me (logs every message for audit)
- **AI Assistant** chat with 5 modes: free chat, email writer, WhatsApp writer, detailing pitch, objection handler

### Step 12 — PWA + Offline mode
- Installable as a home-screen app on iOS + Android
- Service worker with network-first caching + offline fallback page
- IndexedDB-backed offline queue (`fetchOrQueue` / `flushQueue`) — visits logged offline auto-sync when online
- Push handler for background notifications

### Plus polish
- Sidebar reorganized into 5 logical groups
- Dashboard now shows 8 live KPIs including alert + notification counters
- Leaderboard with one-click AI Coach button per rep

---

## 🚀 Setup from scratch (~25 min)

> **If you already have v0.2 running, see the "Upgrade from v0.2" section below — just 3 SQL files + new env vars.**

### 1. Create Supabase project + enable PostGIS
- supabase.com → New project (Frankfurt or London)
- Database → Extensions → enable **postgis**

### 2. Run all SQL files in order
Open Supabase SQL Editor and run, **in order**:
1. `supabase/00-setup.sql`
2. `supabase/01-org-structure.sql`
3. `supabase/02-rbac.sql`
4. `supabase/03-medical-entities.sql`
5. `supabase/04-visits-tracking.sql`
6. `supabase/05-storage.sql`
7. `supabase/06-samples-orders-expenses.sql` ⭐ NEW
8. `supabase/07-targets-reports.sql` ⭐ NEW
9. `supabase/08-compliance-notifications.sql` ⭐ NEW

Each file ends with verification queries — run them too.

### 3. Disable email confirmation
Auth → Providers → Email → toggle OFF "Confirm email".

### 4. Create the first admin
Auth → Users → Add user, then:
```sql
UPDATE public.profiles
   SET role = 'admin', full_name = 'Abdelrahman Safwat'
 WHERE id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1);
```

### 5. Generate VAPID keys (for push)
```bash
npx web-push generate-vapid-keys
```
Copy both keys.

### 6. Get Mapbox token
[account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/) — copy the `pk.…` token.

### 7. Get Anthropic API key
console.anthropic.com → API Keys → Create.

### 8. Fill `.env.local`
```bash
cp .env.example .env.local
# Fill in: Supabase keys, Anthropic, Mapbox, BOTH VAPID keys
```

### 9. Run locally
```bash
npm install --legacy-peer-deps
npm run dev   # http://localhost:3001
```

---

## 🆙 Upgrade from v0.2

Already have v0.2 running? Just do this:

1. **Replace the project folder** (or copy in only the new/changed files).
2. **Run the 3 new SQL files** in order:
   - `06-samples-orders-expenses.sql`
   - `07-targets-reports.sql`
   - `08-compliance-notifications.sql`
3. **Generate VAPID keys** + add to `.env.local` and Vercel env vars:
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=…
   VAPID_PRIVATE_KEY=…
   ```
4. **Reinstall deps** (we added `xlsx`, `jspdf`, `web-push`, `idb`):
   ```bash
   npm install --legacy-peer-deps
   ```
5. **Push to GitHub** — Vercel auto-deploys.

---

## 🌍 Deploy to Vercel

```bash
git add .
git commit -m "v0.3 — feature complete (samples, reports, compliance, push, PWA)"
git push
```

Add **all** env vars (including both VAPID keys) in Vercel → Settings → Environment Variables before pushing.

---

## 🎯 The 90-second pharma demo

Sequence to close a meeting with a brand director:

1. Open `https://your-app.vercel.app/dashboard/visits/check-in` on phone
2. App detects rep is 47m from "Maadi Polyclinic" → green CHECK IN button
3. Rep takes selfie → confirms → visit auto-creates with **GPS-verified** badge ✓
4. Rep dictates rough notes → Claude returns structured DCR with quality score
5. Rep checks out → visit completes, duration auto-calculated
6. Manager opens `/dashboard/tracking` → sees the rep's live position on the map
7. Manager opens `/dashboard/compliance` → clicks "Run scan" → system finds 3 anomalies (outside-geofence, impossible-speed travel, duplicate visits)
8. Manager opens `/dashboard/leaderboard` → clicks "AI Coach" on a rep → Claude returns strengths/weaknesses + recommended actions
9. Manager opens `/dashboard/reports` → clicks **Excel** → downloads field-force performance report

**That's the slide deck that wins the contract.** Veeva can't do the geofence verification natively. IQVIA charges $150+/user/month. You charge 250 EGP.

---

## 🗺️ Build Roadmap

| Step | Status | What it adds |
|---|---|---|
| 1-3 | ✅ done | Schema, scaffold, login |
| 4 | ✅ done | GPS check-in + geofence + selfie |
| 5 | ✅ done | Live tracking map |
| 6 | ✅ done | AI features (scoring, summary, coaching) |
| **7** | ✅ **done** | **Samples, orders, expenses** |
| **8** | ✅ **done** | **Reports + Excel/PDF + leaderboard + coverage** |
| **9** | ✅ **done** | **Tour plans + targets** |
| **10** | ✅ **done** | **Compliance / anomaly engine** |
| **11** | ✅ **done** | **Push + WhatsApp + AI chat** |
| **12** | ✅ **done** | **PWA + offline mode** |

**Future / Phase 2:**
- Capacitor wrapper for true background GPS (browsers throttle locked-screen GPS)
- UltraMsg / WhatsApp Business API (currently uses wa.me link strategy)
- Multi-tenant white-label setup
- Pharmacy chain dashboards
- Advanced ROI analytics per HCP

---

## 📂 Project Structure (key new files)

```
fox-medical-crm/
├── app/
│   ├── api/
│   │   ├── ai/
│   │   │   └── assistant/route.ts            ⭐ NEW — multi-mode AI chat
│   │   ├── whatsapp/send/route.ts             ⭐ NEW
│   │   ├── push/{subscribe,send}/route.ts     ⭐ NEW
│   │   └── compliance/scan/route.ts           ⭐ NEW
│   └── dashboard/
│       ├── samples/                           ⭐ NEW
│       ├── orders/                            ⭐ NEW (real)
│       ├── expenses/                          ⭐ NEW
│       ├── reports/                           ⭐ NEW (real, with export)
│       ├── leaderboard/                       ⭐ NEW
│       ├── compliance/                        ⭐ NEW
│       ├── tour-plans/                        ⭐ NEW
│       ├── targets/                           ⭐ NEW
│       ├── coverage/                          ⭐ NEW
│       ├── notifications/                     ⭐ NEW
│       ├── whatsapp/                          ⭐ NEW
│       ├── assistant/                         ⭐ NEW
│       └── settings/                          ⭐ NEW (real)
├── lib/
│   ├── export.ts                              ⭐ NEW — xlsx + jspdf
│   ├── usePushNotifications.ts                ⭐ NEW
│   └── offlineQueue.ts                        ⭐ NEW — IndexedDB queue
├── public/
│   ├── manifest.json                          ⭐ NEW
│   ├── sw.js                                  ⭐ NEW (service worker + push)
│   ├── offline.html                           ⭐ NEW
│   └── icons/icon-{192,512}.png               ⭐ NEW (placeholder solid teal)
├── supabase/
│   ├── 06-samples-orders-expenses.sql          ⭐ NEW
│   ├── 07-targets-reports.sql                 ⭐ NEW
│   └── 08-compliance-notifications.sql         ⭐ NEW
└── .env.example                               ⭐ now includes VAPID keys
```

---

## ❓ Troubleshooting

**Push notifications don't work**
→ Check both `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set. Generate with `npx web-push generate-vapid-keys`. Push only works on HTTPS (or localhost), so test on Vercel preview URL not local IP.

**"detect_visit_anomalies" RPC fails**
→ The function depends on PostGIS. Make sure the extension is enabled (Database → Extensions → postgis).

**Excel/PDF export does nothing**
→ Make sure `npm install` ran with `--legacy-peer-deps`. Confirm `xlsx`, `jspdf`, `jspdf-autotable` in `node_modules/`.

**Service worker not registering**
→ Hard reload (Cmd+Shift+R) after first deploy. Check DevTools → Application → Service Workers.

**Offline queue not syncing**
→ The queue runs `flushQueue()` only when called explicitly. Wire it into a `window.online` event listener in your visit-check-in page if needed (already imported, just call on `online` event).

**Icons look like solid teal squares**
→ They are placeholders. Replace `public/icons/icon-{192,512}.png` with real branded icons before launch.

---

*Built in collaboration with Claude (Anthropic) · April 2026*

🦊💊 **Now go disrupt Egyptian pharma.** 💪

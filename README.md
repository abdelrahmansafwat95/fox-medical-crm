# 🦊💊 FoxSystems Medical CRM — v0.2

AI-powered Pharmaceutical & Medical Sales CRM with **GPS-verified visit tracking**.
Built for Egyptian and GCC pharma companies.

**Stack:** Next.js 14 · TypeScript · Supabase (PostgreSQL + PostGIS) · Tailwind CSS · Anthropic Claude · Mapbox GL JS
**Owner:** FoxSystems Tech — foxsystemstech.com

---

## 🆕 What's new in v0.2 (Steps 4 + 5 + 6)

- **GPS Check-in flow with selfie** — geofence-verified visit creation
- **Visit detail page** with check-out, AI summary, doctor feedback fields
- **Live tracking map** (Mapbox GL JS) with rep markers + 60s auto-refresh
- **AI HCP scoring** — auto-segmentation (A/B/C/D/KOL) via Claude
- **AI visit summaries** — rep dictates rough notes, Claude turns them into a clean DCR
- **AI rep coaching** — strengths/weaknesses + concrete actions for managers
- **AI route optimizer** — best visit order considering Cairo traffic + segments
- **Tracking ping API** — `/api/tracking/ping` for continuous GPS updates
- **PostGIS RPC functions** — `record_check_in`, `record_check_out`, `nearest_institutions`, `check_geofence`

---

## 🚀 First-Time Setup (do this once)

### 1. Create a Supabase project + enable PostGIS

- supabase.com → New project (Frankfurt or London region)
- Database → Extensions → enable **postgis**

### 2. Run the SQL files in order

Open Supabase SQL Editor → New query → paste and run each file from `supabase/`:

1. `00-setup.sql` — extensions and helpers
2. `01-org-structure.sql` — profiles, branches, territories
3. `02-rbac.sql` — permissions matrix
4. `03-medical-entities.sql` — institutions, HCPs, products
5. **`04-visits-tracking.sql`** — visits, tour_plans, rep_locations, geofence functions ⭐ NEW
6. **`05-storage.sql`** — buckets for selfies + signatures ⭐ NEW

Run the verification queries at the bottom of each file before moving on.

### 3. Disable email confirmation

Auth → Providers → Email → toggle OFF "Confirm email".

### 4. Create your first admin user

Auth → Users → Add user, then in SQL editor:

```sql
UPDATE public.profiles
   SET role = 'admin', full_name = 'Abdelrahman Safwat'
 WHERE id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1);
```

### 5. Get a Mapbox access token (free)

- Go to [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/)
- Sign up → "Create a token" → copy the **public token** (starts with `pk.`)

### 6. Get an Anthropic API key

- console.anthropic.com → API Keys → Create

### 7. Fill in `.env.local`

```bash
cp .env.example .env.local
# edit .env.local with all 4 keys: Supabase URL + anon + service_role,
# Anthropic key, and Mapbox token
```

---

## 💻 Run Locally

```bash
npm install --legacy-peer-deps
npm run dev    # runs on http://localhost:3001
```

### Test the differentiator (GPS check-in)

1. Sign in
2. **Dashboard → "New Check-in"** (top right)
3. Allow location permission when prompted
4. You'll see seeded Cairo institutions sorted by distance
5. **Tip for testing**: open Chrome DevTools → 3-dot menu → More tools → Sensors → set Location to **Custom** and paste `29.9603, 31.2569` (Maadi Polyclinic Demo coordinates) — that puts you exactly on the geofence
6. Pick the institution → choose an HCP → take selfie → confirm
7. You'll see the visit detail page with GPS-verified badge ✓
8. **Dictate rough notes** → click "Generate AI summary" → Claude returns a structured DCR
9. **Check out** → visit completes with duration

---

## 🌍 Deploy to Vercel

```bash
git init && git branch -M main
git add . && git commit -m "Fox Medical CRM v0.2 — GPS + AI"
git remote add origin https://github.com/YOUR_USERNAME/fox-medical-crm.git
git push -u origin main
```

Then vercel.com/new → import repo → **paste all env vars including the Mapbox token** → Deploy.

---

## 📂 Project Structure

```
fox-medical-crm/
├── app/
│   ├── api/
│   │   ├── tracking/{ping, check-in, check-out}/route.ts  ⭐ NEW
│   │   └── ai/{score-hcp, summarize-visit, coach-rep, optimize-route}/route.ts  ⭐ NEW
│   ├── login/page.tsx
│   └── dashboard/
│       ├── layout.tsx
│       ├── page.tsx                       ⭐ now with live KPIs
│       ├── hcps/page.tsx                  ⭐ AI scoring button per HCP
│       ├── institutions/page.tsx          ⭐ map preview links
│       ├── products/page.tsx              ⭐ key messages expander
│       ├── visits/
│       │   ├── page.tsx                   ⭐ list with status + geo badge
│       │   ├── check-in/page.tsx          ⭐ THE GPS check-in flow
│       │   └── [id]/page.tsx              ⭐ detail + AI summary + check-out
│       ├── tracking/page.tsx              ⭐ live Mapbox map
│       ├── samples/, orders/, reports/, team/, settings/   (placeholders)
├── components/
│   ├── Sidebar.tsx, MobileNav.tsx, Topbar.tsx
├── lib/
│   ├── supabase.ts
│   ├── types.ts                           ⭐ Visit, RepLocation, NearestInstitution types
│   ├── useGeolocation.ts                  ⭐ NEW — GPS hook
│   └── utils.ts
├── supabase/
│   ├── 00-setup.sql
│   ├── 01-org-structure.sql
│   ├── 02-rbac.sql
│   ├── 03-medical-entities.sql
│   ├── 04-visits-tracking.sql             ⭐ NEW
│   └── 05-storage.sql                     ⭐ NEW
├── .env.example                           ⭐ now requires Mapbox + Anthropic
├── package.json                           ⭐ now port 3001 + mapbox-gl
└── README.md
```

---

## 🎯 The Money Shot Demo

This is the 60-second flow that closes a pharma sales meeting:

1. Open `/dashboard/visits/check-in` on phone
2. App reads GPS → sees you're 47m from "Dr. Hassan Maadi Clinic"
3. Tap green "CHECK IN" button
4. Take selfie
5. Pick visit type, confirm
6. Land on visit detail page → big green "GPS-verified ✓ 47m from anchor" banner
7. Dictate rough notes → click "Generate AI summary"
8. Claude returns structured DCR with quality score, doctor attitude, objections, coaching notes
9. Tap "Check out" → visit completes with auto-calculated duration
10. Manager opens `/dashboard/tracking` → sees the rep's live position on the map

**That's the slide that wins the contract.**

---

## 🗺️ Build Roadmap

| Step | Status | What it adds |
|---|---|---|
| 1 | ✅ done | Supabase foundation |
| 2 | ✅ done | Medical entities |
| 3 | ✅ done | Project scaffold + login + dashboard shell |
| **4** | ✅ **done** | **Visits + GPS check-in + geofencing + selfie** |
| **5** | ✅ **done** | **Live tracking map** (Mapbox + Realtime) |
| **6** | ✅ **done** | **AI features** (HCP scoring, visit summaries, coaching, route optimizer) |
| 7 | 🔜 next | Samples, orders, expenses, reports |
| 8 | 🔜 | PWA + push notifications + offline mode |
| 9 | 🔜 | Anomaly engine + compliance alerts |
| 10 | 🔜 | Capacitor native app for true background GPS |

---

## ❓ Troubleshooting

**Check-in says "outside_geofence"**
→ You're more than the institution's radius (default 100m) from its registered coordinates.
   For testing, override your browser GPS via DevTools → Sensors → Custom location, or
   widen the geofence: `UPDATE institutions SET geofence_radius_m = 500 WHERE name = '...';`

**Map shows "Mapbox token missing"**
→ Add `NEXT_PUBLIC_MAPBOX_TOKEN=pk.…` to `.env.local` (and Vercel env vars), then restart `npm run dev`.

**AI features return "missing_anthropic_key"**
→ Add `ANTHROPIC_API_KEY=sk-ant-…` to `.env.local`.

**RLS errors when inserting visits**
→ Make sure you're signed in. Anonymous users can't insert into `visits` or `rep_locations`.

**npm install fails**
→ Always use `npm install --legacy-peer-deps` (same fix as Fox RE).

---

*Built in collaboration with Claude (Anthropic) · April 2026*

🦊💊 **Now go disrupt Egyptian pharma.** 💪

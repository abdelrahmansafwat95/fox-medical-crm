# 🦊💊 FoxSystems Medical CRM

AI-powered Pharmaceutical & Medical Sales CRM with **GPS-verified visit tracking**.
Built for Egyptian and GCC pharma companies.

**Stack:** Next.js 14 · TypeScript · Supabase (PostgreSQL + PostGIS) · Tailwind CSS · Anthropic Claude
**Owner:** FoxSystems Tech — foxsystemstech.com

---

## 🚀 First-Time Setup (do this once)

### 1. Create a new Supabase project

- Go to [supabase.com](https://supabase.com) → **New project**
- Name: `fox-medical-crm`
- Region: **Frankfurt** or **London** (closest to Egypt)
- Save the database password somewhere safe

### 2. Enable PostGIS

- Dashboard → **Database** → **Extensions** → search `postgis` → toggle ON

### 3. Run the SQL files in order

Open Dashboard → **SQL Editor** → New query, then paste and run each file from
the `supabase/` folder **in this exact order**:

1. `00-setup.sql` — extensions and helpers
2. `01-org-structure.sql` — profiles, branches, territories
3. `02-rbac.sql` — permissions matrix and role helpers
4. `03-medical-entities.sql` — institutions, HCPs, products

The verification queries at the bottom of each file should return the expected
results before moving to the next.

### 4. Disable email confirmation

Dashboard → **Authentication** → **Providers** → **Email** → toggle OFF
**“Confirm email”**. (Same as Fox RE — speeds up first-user creation.)

### 5. Create your first admin user

Dashboard → **Authentication** → **Users** → **Add user** → enter your email
and a password.

Then go back to **SQL Editor** and run:

```sql
UPDATE public.profiles
   SET role = 'admin', full_name = 'Abdelrahman Safwat'
 WHERE id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1);
```

### 6. Grab credentials for `.env.local`

Dashboard → **Settings** → **API** → copy:

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## 💻 Run Locally

```bash
# 1. Install dependencies (use legacy peer deps — same as Fox RE)
npm install --legacy-peer-deps

# 2. Create .env.local from the template and fill in your Supabase values
cp .env.example .env.local
#    → edit .env.local, paste your Supabase URL + keys

# 3. Start dev server
npm run dev

# Open http://localhost:3000 → log in with the admin account you created
```

You should see:

1. Login screen with EN/AR toggle
2. After login → Dashboard with KPI cards (HCPs, institutions, products counts)
3. The seeded counts: `institutions=5`, `products=3`, `hcps=0`

---

## 🌍 Deploy to Vercel (same flow as Fox RE)

### 1. Create a NEW GitHub repo

```bash
# In the project folder:
git init
git branch -M main
git add .
git commit -m "Initial commit — Fox Medical CRM scaffold"

# Create empty repo on github.com (e.g. 'fox-medical-crm'), then:
git remote add origin https://github.com/YOUR_USERNAME/fox-medical-crm.git
git push -u origin main
```

### 2. Import to Vercel

- Go to [vercel.com/new](https://vercel.com/new)
- Pick the new GitHub repo → **Import**
- Framework: Next.js (auto-detected)
- **Add environment variables** (paste the same values from `.env.local`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_NAME`
  - `NEXT_PUBLIC_APP_URL` — set to your Vercel URL once you have it
- Click **Deploy**

After ~60 seconds you'll have a live URL like
`fox-medical-crm.vercel.app` that auto-redeploys on every `git push`.

---

## 📂 Project Structure

```
fox-medical-crm/
├── app/
│   ├── layout.tsx              ← root layout
│   ├── page.tsx                ← redirects to /login or /dashboard
│   ├── globals.css             ← Tailwind + Cairo font
│   ├── login/
│   │   └── page.tsx            ← bilingual login (EN/AR)
│   └── dashboard/
│       ├── layout.tsx          ← auth-guarded shell with Sidebar + Topbar
│       ├── page.tsx            ← KPI dashboard
│       ├── hcps/               ← (placeholder) Step 4
│       ├── institutions/       ← (placeholder) Step 4
│       ├── products/           ← (placeholder) Step 4
│       ├── visits/             ← (placeholder) Step 4
│       ├── tracking/           ← (placeholder) Step 5
│       ├── samples/            ← (placeholder) Step 7
│       ├── orders/             ← (placeholder) Step 7
│       ├── reports/            ← (placeholder) Step 7
│       ├── team/               ← (placeholder) future
│       └── settings/           ← (placeholder) future
├── components/
│   ├── Sidebar.tsx             ← desktop nav
│   ├── MobileNav.tsx           ← mobile bottom tab bar
│   └── Topbar.tsx              ← top header with user + notifications
├── lib/
│   ├── supabase.ts             ← Supabase client
│   ├── types.ts                ← TypeScript types matching the DB
│   └── utils.ts                ← cn() helper
├── supabase/
│   ├── 00-setup.sql            ← Step 1 — extensions
│   ├── 01-org-structure.sql    ← Step 1 — profiles, branches, territories
│   ├── 02-rbac.sql             ← Step 1 — permissions matrix
│   └── 03-medical-entities.sql ← Step 2 — institutions, HCPs, products
├── public/
│   └── icons/                  ← PWA icons (added in later steps)
├── .env.example                ← template — copy to .env.local
├── .gitignore                  ← never commit .env.local
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md                   ← this file
```

---

## 🗺️ Build Roadmap

| Step | Status | What it adds |
|---|---|---|
| 1 | ✅ done | Supabase foundation: extensions, profiles, RBAC, territories |
| 2 | ✅ done | Medical entities: institutions, HCPs, products, key messages |
| 3 | ✅ done | **Project scaffold + login + dashboard shell** ← you are here |
| 4 |  🔜  | Visits + GPS check-in + geofencing (the differentiator) |
| 5 |  🔜  | Live tracking map (Mapbox + Supabase Realtime) |
| 6 |  🔜  | AI features (HCP segmentation, visit summaries, coaching) |
| 7 |  🔜  | Samples, orders, expenses, reports |
| 8 |  🔜  | PWA + push notifications + offline mode |
| 9 |  🔜  | Anomaly engine + compliance alerts |
| 10 |  🔜 | Capacitor native app for true background GPS |

---

## ❓ Troubleshooting

**`npm install` fails with peer dep errors**
→ Use `npm install --legacy-peer-deps` (same fix as Fox RE).

**Login button does nothing / "Invalid email or password"**
→ Check `.env.local` has the correct Supabase URL and anon key.
→ Confirm "Confirm email" is OFF in Supabase Auth settings.

**Dashboard shows "—" or "0" for everything**
→ You haven't run the SQL files yet, OR you're signed in as a non-admin user
   whose RLS doesn't let them see the catalog.

**Vercel build fails with "Cannot find module '@/lib/...'"**
→ Make sure `tsconfig.json` has the `paths` mapping. It's already set in this repo.

---

*Built in collaboration with Claude (Anthropic) · April 2026*

🦊💊 **Now go disrupt Egyptian pharma.** 💪

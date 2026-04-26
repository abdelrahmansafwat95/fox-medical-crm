# 🗺️ MapTiler Migration Patch — replaces Mapbox

**Why:** MapTiler offers 100,000 tile loads/month FREE — no credit card required.
Mapbox asks for a card after a usage threshold and is harder to sign up for.

**API differences:** Almost none. We use **MapLibre GL JS** (the open-source fork of Mapbox GL JS) which has the exact same API. Switching is a 2-file change.

---

## 1. Get your free MapTiler key (~2 minutes)

1. Go to https://www.maptiler.com/cloud/
2. Click **Get started for free** → sign up with email (no card asked)
3. Verify email → log in → go to **Account → Keys**
4. Copy your **Default key** (looks like `Hd7fF...3xY`)

That's it. 100k tile loads/month free, forever.

---

## 2. Apply the patch (~3 minutes)

In your `fox-medical-crm` project folder:

### a) Replace `package.json`
Copy the `package.json` from this patch over your existing one. Key change:
- ❌ removed: `"mapbox-gl"` and `"@types/mapbox-gl"`
- ✅ added: `"maplibre-gl": "^4.5.0"`

### b) Replace `app/dashboard/tracking/page.tsx`
Copy `app-dashboard-tracking-page.tsx` from this patch → save as
`app/dashboard/tracking/page.tsx` (overwriting the existing file).

Changes are minimal:
- `import mapboxgl from "mapbox-gl"` → `import maplibregl from "maplibre-gl"`
- All `mapboxgl.X` references → `maplibregl.X`
- `mapboxgl.accessToken = token` → removed (key now goes in URL)
- Style URL changed from Mapbox style ID to MapTiler style URL

### c) Replace `.env.example`
Copy the `.env.example` from this patch over your existing one.

### d) Update your real `.env.local`
Open `.env.local` and:
- ❌ remove the line: `NEXT_PUBLIC_MAPBOX_TOKEN=...`
- ✅ add the line: `NEXT_PUBLIC_MAPTILER_KEY=your-maptiler-key-here`

### e) Update Vercel environment variables
Go to vercel.com → your project → Settings → Environment Variables:
- ❌ delete: `NEXT_PUBLIC_MAPBOX_TOKEN`
- ✅ add: `NEXT_PUBLIC_MAPTILER_KEY` = your MapTiler key

### f) Reinstall dependencies
```bash
npm install --legacy-peer-deps
```

### g) Test locally
```bash
npm run dev   # http://localhost:3001
```
Visit `/dashboard/tracking` — you should see the map render with MapTiler tiles.

### h) Push to deploy
```bash
git add .
git commit -m "Switch from Mapbox to MapTiler (no credit card required)"
git push
```

Vercel auto-deploys. Done.

---

## What the user sees

Identical experience. The map looks slightly different (MapTiler's `streets-v2` style is similar to Mapbox Streets but cleaner and more European-looking). Markers, popups, fly-to animations, RTL Arabic labels — all work identically.

---

## Other map style options

Don't like the default `streets-v2` look? In `tracking/page.tsx`, change the style URL to one of:

| Style | URL fragment |
|---|---|
| Streets (default) | `streets-v2` |
| Bright | `bright-v2` |
| Basic | `basic-v2` |
| Outdoor | `outdoor-v2` |
| Satellite | `satellite` |
| Dark mode | `streets-v2-dark` |
| OSM Standard | `openstreetmap` |

Browse them all at https://cloud.maptiler.com/maps/

---

## Pricing reality check

- **Free:** 100,000 tile loads / month (≈ 3,300/day)
- A typical "rep opens tracking page" = ~50 tile loads
- That's **2,000 page-opens/day** before you hit the limit

For a CRM with ~10 active managers checking tracking 5x per day, you're using
~10% of your free quota. You'll never pay until you have hundreds of customers.

When you do scale, paid plans start at €25/month — much cheaper than Mapbox at scale.

// The public REST API: what an API key created on /integrations can do.
//
//   GET    /v1                      who you are: the key's name and scopes
//   GET    /v1/{resource}           list (limit ≤ 100, offset, updated_since, status/stage filters)
//   GET    /v1/{resource}/{id}      one record
//   POST   /v1/{resource}           create
//   PATCH  /v1/{resource}/{id}      update the writable fields sent
//
// Auth: "Authorization: Bearer fox_md_…" or "X-API-Key: fox_md_…". The key is
// looked up by its SHA-256 (api_key_check), must hold '{resource}:read' or
// ':write', and gets 120 requests a minute. Records are read and written with
// the service role, so ONLY the fields listed below are ever accepted, and a
// record created through the API is attributed to the admin who made the key.
// No deletes: an integration that goes wrong must not be able to empty the CRM.
// Visits are read-only: a visit is proof a rep was there (GPS), which an API
// call cannot give. Orders can be moved along (status, delivery), not created.
// verify_jwt = false (the function checks the key itself).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } });

type Resource = {
  table: string;
  writable?: Record<string, "text" | "number" | "uuid" | "date" | "int" | "bool">;
  select?: string;          // columns to return, when not all of them
  patchOnly?: boolean;      // may be updated, not created
  required?: string[];
  filters?: string[];
  touched: "updated_at" | "created_at";
};

const RESOURCES: Record<string, Resource> = {
  hcps: {
    table: "hcps", touched: "updated_at", required: ["full_name"], filters: ["segment", "specialty", "assigned_rep_id", "is_active"],
    writable: { full_name: "text", full_name_ar: "text", title: "text", gender: "text", specialty: "text", sub_specialty: "text",
      qualification: "text", license_number: "text", license_expiry: "date", phone: "text", mobile: "text", email: "text",
      whatsapp: "text", preferred_language: "text", segment: "text", decile: "int", is_kol: "bool", assigned_rep_id: "uuid",
      notes: "text", is_active: "bool" },
  },
  institutions: {
    table: "institutions", touched: "updated_at", required: ["name", "type"], filters: ["type", "city", "governorate", "is_active"],
    select: "id,name,name_ar,type,chain_id,latitude,longitude,geofence_radius_m,address,address_ar,city,district,governorate,postal_code,phone,email,website,working_days,opening_time,closing_time,bed_count,tier,license_number,territory_id,notes,is_active,created_at,updated_at,code",
    writable: { name: "text", name_ar: "text", type: "text", latitude: "number", longitude: "number", geofence_radius_m: "int",
      address: "text", address_ar: "text", city: "text", district: "text", governorate: "text", phone: "text", email: "text",
      website: "text", tier: "text", notes: "text", is_active: "bool" },
  },
  orders: {
    table: "orders", touched: "updated_at", filters: ["status", "rep_id", "institution_id", "hcp_id"], patchOnly: true,
    writable: { status: "text", notes: "text", expected_delivery_date: "date" },
  },
  products: { table: "products", touched: "updated_at", filters: ["product_line", "therapy_area", "is_active"] },
  visits: { table: "visits", touched: "updated_at", filters: ["status", "rep_id", "hcp_id", "institution_id"],
    select: "id,rep_id,hcp_id,institution_id,planned_at,plan_id,check_in_at,check_out_at,check_in_within_geofence,check_in_distance_m,duration_minutes,visit_type,status,products_detailed,doctor_attitude,doctor_feedback,samples_given_summary,order_taken,order_id,next_action,next_visit_date,manager_status,notes,created_at,updated_at" },
  events: { table: "events", touched: "updated_at", filters: ["status", "event_type"] },
  expenses: { table: "expenses", touched: "updated_at", filters: ["status", "rep_id", "category"],
    select: "id,rep_id,expense_date,category,amount,currency,description,linked_visit_id,distance_km,status,approved_by,approved_at,paid_at,rejection_reason,created_at,updated_at" },
  tour_plans: { table: "tour_plans", touched: "updated_at", filters: ["status", "rep_id"],
    select: "id,rep_id,plan_date,status,planned_hcps,estimated_distance_km,notes,submitted_at,approved_by,approved_at,manager_notes,created_at,updated_at" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

// Only the listed fields, each checked against its type.
function clean(res: Resource, body: Record<string, unknown>, creating: boolean) {
  const out: Record<string, unknown> = {};
  const unknown = Object.keys(body).filter((k) => !(k in (res.writable ?? {})));
  if (unknown.length) throw new Error(`Unknown or read-only field(s): ${unknown.join(", ")}`);
  for (const [k, type] of Object.entries(res.writable ?? {})) {
    if (!(k in body)) continue;
    const v = body[k];
    if (v === null || v === "") { out[k] = null; continue; }
    if (type === "number" && (typeof v !== "number" || !isFinite(v))) throw new Error(`${k} must be a number`);
    if (type === "int" && !Number.isInteger(v)) throw new Error(`${k} must be a whole number`);
    if (type === "uuid" && !(typeof v === "string" && UUID.test(v))) throw new Error(`${k} must be an id (uuid)`);
    if (type === "date" && !(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) throw new Error(`${k} must be a date, YYYY-MM-DD`);
    if (type === "bool" && typeof v !== "boolean") throw new Error(`${k} must be true or false`);
    if (type === "text" && typeof v !== "string") throw new Error(`${k} must be text`);
    out[k] = typeof v === "string" ? v.slice(0, 5000) : v;
  }
  if (creating) for (const r of res.required ?? []) if (out[r] == null) throw new Error(`${r} is required`);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/public-api/, "").replace(/^\/public-api/, "").replace(/\/+$/, "") || "/";

  // ---- the key --------------------------------------------------------
  const auth = req.headers.get("authorization") ?? "";
  const key = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : req.headers.get("x-api-key") ?? "").trim();
  if (!key.startsWith("fox_md_")) return fail(401, "missing_key", "Send your API key as 'Authorization: Bearer fox_md_…'.");
  const { data: k, error: kErr } = await db.rpc("api_key_check", { p_key: key });
  if (kErr) return fail(500, "error", "Could not check the key.");
  if (!k) return fail(401, "invalid_key", "This API key is not valid or has been revoked.");
  if (k.plan_api === false) return fail(403, "plan", "API access is part of the Business and Complete plans. Contact Fox Systems to upgrade.");
  if (k.limited) return fail(429, "rate_limited", "Too many requests: the limit is 120 a minute per key.");
  const scopes: string[] = k.scopes ?? [];

  // ---- routing --------------------------------------------------------
  const m = /^\/v1(?:\/([a-z]+))?(?:\/([0-9a-f-]{36}))?$/i.exec(path);
  if (!m) return fail(404, "not_found", "Unknown path. See /v1 for what this key can do.");
  const [, name, id] = m;
  if (!name) {
    const { data } = await db.from("api_keys").select("name, prefix, scopes, created_at").eq("id", k.id).single();
    return json({ data: { key: data, resources: Object.keys(RESOURCES) } });
  }
  const res = RESOURCES[name];
  if (!res) return fail(404, "not_found", `Unknown resource '${name}'. Try: ${Object.keys(RESOURCES).join(", ")}.`);
  const need = req.method === "GET" ? `${name}:read` : `${name}:write`;
  if (!scopes.includes(need)) return fail(403, "missing_scope", `This key does not have the '${need}' permission.`);
  if (req.method !== "GET" && !res.writable) return fail(405, "read_only", `${name} are read-only through the API.`);
  if (req.method === "POST" && res.patchOnly) return fail(405, "update_only", `${name} can be updated through the API, not created.`);

  try {
    if (req.method === "GET" && id) {
      const { data, error } = await db.from(res.table).select(res.select ?? "*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? json({ data }) : fail(404, "not_found", "No record with that id.");
    }
    if (req.method === "GET") {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50") || 50, 1), 100);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0") || 0, 0);
      let q = db.from(res.table).select(res.select ?? "*", { count: "exact" }).order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      const since = url.searchParams.get("updated_since");
      if (since) {
        if (isNaN(Date.parse(since))) return fail(400, "bad_request", "updated_since must be an ISO date or time.");
        q = q.gte(res.touched, since);
      }
      for (const f of res.filters ?? []) {
        const v = url.searchParams.get(f);
        if (v) q = q.eq(f, v);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return json({ data, meta: { total: count, limit, offset } });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "bad_request", "Send a JSON object.");
    if (req.method === "POST" && !id) {
      const row = clean(res, body, true);
      const { data, error } = await db.from(res.table).insert({ ...row, created_by: k.created_by }).select(res.select ?? "*").single();
      if (error) throw error;
      return json({ data }, 201);
    }
    if (req.method === "PATCH" && id) {
      const row = clean(res, body, false);
      if (!Object.keys(row).length) return fail(400, "bad_request", "Nothing to update.");
      const { data, error } = await db.from(res.table).update(row).eq("id", id).select(res.select ?? "*").maybeSingle();
      if (error) throw error;
      return data ? json({ data }) : fail(404, "not_found", "No record with that id.");
    }
    return fail(405, "method_not_allowed", "Use GET, POST or PATCH.");
  } catch (e) {
    // Database refusals (a value outside the allowed list, a missing link) are the caller's to fix.
    const msg = (e as { message?: string }).message ?? String(e);
    const check = /violates check constraint "[a-z]+_([a-z_]+)_check"/.exec(msg);
    if (check) return fail(400, "invalid_value", `Invalid value for ${check[1]} — see the API docs for the allowed values.`);
    if (/violates foreign key constraint/.test(msg)) return fail(400, "invalid_reference", "A linked id does not exist.");
    return fail(400, "bad_request", msg.slice(0, 300));
  }
});

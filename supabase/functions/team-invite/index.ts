// team-invite — an admin adds a team member from the Team page.
//
// Deployed with verify_jwt = true, and the function then checks the caller's
// own profile: only an active admin may create accounts. (A public-demo
// visitor is a country_manager, so they are refused too.)
//
// The account is created with a temporary password that is returned ONCE to
// the admin, who passes it on (the page offers Copy and WhatsApp). No email is
// sent: this project uses Supabase's built-in mailer, which only delivers to
// the project's own team addresses and is rate-limited, so an emailed invite
// would silently never arrive. The new user changes the password in Settings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Same set as the CHECK constraint on profiles.role.
const ROLES = [
  "medical_rep", "medical_rep_senior", "district_manager", "regional_manager",
  "sales_director", "country_manager", "admin",
];

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const orNull = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

// Readable: no 0/O, 1/l/I, so it survives being read out or retyped.
function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `Fox-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: me } = await admin.from("profiles").select("role, is_active").eq("id", user.id).single();
    if (me?.role !== "admin" || me?.is_active === false) {
      return json({ error: "Only an admin can add team members" }, 403);
    }

    const b = await req.json().catch(() => ({}));
    const email = clip(b.email, 200).toLowerCase();
    const fullName = clip(b.full_name, 120);
    const role = clip(b.role, 40);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (fullName.length < 2) return json({ error: "Enter the person's full name." }, 400);
    if (!ROLES.includes(role)) return json({ error: "Choose a role." }, 400);

    // The plan's user limit (fox_plan). The database enforces it too, but
    // checking first means no login is created for someone who can't be added.
    const { data: seats } = await admin.rpc("seat_usage");
    if (seats && seats.used >= seats.limit) {
      const plan = String(seats.plan).charAt(0).toUpperCase() + String(seats.plan).slice(1);
      return json({ error: `Your plan (${plan}) includes up to ${seats.limit} active users. Deactivate a user or upgrade the plan to add more.` }, 403);
    }

    const password = tempPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (createError || !created.user) {
      const msg = createError?.message ?? "";
      return /already|registered|exists/i.test(msg)
        ? json({ error: "Someone with this email already has an account." }, 409)
        : json({ error: "Could not create the account." }, 500);
    }

    // handle_new_user made the profile as a medical_rep; set it up properly.
    // (Service role: no JWT, so tg_profiles_guard lets the org fields through.)
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        role,
        phone: orNull(b.phone),
        line_manager_id: orNull(b.line_manager_id),
        branch_id: orNull(b.branch_id),
        territory_id: orNull(b.territory_id),
        product_line: orNull(b.product_line),
      })
      .eq("id", created.user.id)
      .select("code")
      .single();
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => null);
      return json({ error: `Could not set up the profile: ${profileError.message}` }, 400);
    }

    return json({ user_id: created.user.id, email, code: profile?.code ?? null, temp_password: password });
  } catch (_e) {
    return json({ error: "Failed" }, 500);
  }
});

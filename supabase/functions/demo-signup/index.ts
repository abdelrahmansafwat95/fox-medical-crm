// demo-signup — self-serve public demo accounts (see supabase/12-demo-visitors.sql).
//
// Called server-to-server by foxsystemstech.com's /api/demo-request, never by a
// browser. Deployed with verify_jwt = false because the caller is the website,
// not a signed-in user: it authenticates with the shared secret in
// demo_ops.config, checked inside demo_signup_prepare().
//
// Creates a GoTrue user (handle_new_user makes the profile), turns it into a
// country_manager demo visitor via demo_signup_record(), or reuses the login
// this phone got in the last seven days, and answers with a one-time link to
// the app's /demo/enter page. Nothing is emailed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP = "https://fox-medical-crm.vercel.app";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (x) => x.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const b = await req.json().catch(() => ({}));
    const name = clip(b.name, 120);
    const phone = clip(b.phone, 40);
    const digits = phone.replace(/\D/g, "");
    if (name.length < 2 || digits.length < 7) return json({ error: "Invalid input" }, 400);
    const lang = b.language === "ar" ? "ar" : "en";
    const ip = clip(b.ip, 64) || "unknown";

    const { data: prep, error: prepError } = await admin.rpc("demo_signup_prepare", {
      p_secret: req.headers.get("x-demo-secret") || "", p_phone: digits, p_ip: ip,
    });
    if (prepError) return json({ error: "Failed" }, 500);
    if (!prep?.ok) {
      return prep?.error === "rate_limited"
        ? json({ error: "Too many requests" }, 429)
        : json({ error: "Unauthorized" }, 401);
    }

    let userId: string;
    let email: string;
    const isNew = !prep.existing?.email;
    if (!isNew) {
      userId = prep.existing.user_id;
      email = prep.existing.email;
    } else {
      email = `visitor-${randomHex(6)}@demo.foxmedical.local`;
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password: randomHex(24), email_confirm: true,
        user_metadata: { full_name: name.split(/\s+/)[0] },
      });
      if (error || !created.user) return json({ error: "Could not create the demo account" }, 500);
      userId = created.user.id;
    }

    const { error: recordError } = await admin.rpc("demo_signup_record", {
      p_user_id: userId, p_email: email, p_display_name: name.split(/\s+/)[0],
      p_full_name: name, p_phone: phone, p_phone_normalized: digits,
      p_contact_email: clip(b.email, 200), p_company: clip(b.company, 200),
      p_team_size: clip(b.teamSize, 40), p_lang: lang, p_ip: ip, p_new: isNew,
    });
    if (recordError) {
      if (isNew) await admin.auth.admin.deleteUser(userId).catch(() => null);
      return json({ error: "Could not create the demo account" }, 500);
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) return json({ error: "Could not create the sign-in link" }, 500);

    const url = new URL("/demo/enter", APP);
    url.searchParams.set("token_hash", tokenHash);
    url.searchParams.set("lang", lang);
    return json({ url: url.toString(), returning: !isNew });
  } catch (_e) {
    return json({ error: "Failed" }, 500);
  }
});

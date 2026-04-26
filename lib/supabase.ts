import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  // This will surface as a clear error in the console if .env.local is missing.
  // Don't throw at module load — Vercel build would break before deploy.
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] Missing env vars NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

/**
 * Single shared Supabase client used everywhere in the app.
 * Auth state is auto-persisted to localStorage by the SDK.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

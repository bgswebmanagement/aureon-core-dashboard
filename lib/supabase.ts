import { createClient } from "@supabase/supabase-js";

// Server-only client with the service role key — used exclusively by
// app/api/ingest/route.ts so the Hub can write sensor readings without being
// subject to per-tenant RLS policies. Never import this from client code, nor
// from anything else: the dashboard reads with the user's session (owner,
// tenant, report) or with the admin client in lib/admin (see lib/data-scope.ts).
export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

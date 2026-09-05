import { createClient } from "@supabase/supabase-js";

// Public client (browser + server components) — used once NEXT_PUBLIC_SUPABASE_URL
// and NEXT_PUBLIC_SUPABASE_ANON_KEY are set. Respects Row Level Security.
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

// Server-only client with the service role key — used exclusively by
// app/api/ingest/route.ts so the Hub can write sensor readings without being
// subject to per-tenant RLS policies. Never import this from client code.
export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

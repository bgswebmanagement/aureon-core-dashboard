import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a chave de ADMINISTRAÇÃO (service role): ignora as regras da base
// de dados e pode criar/apagar contas. Só pode ser importado por código dentro
// de lib/admin/ e app/admin/ — e só DEPOIS de verificar que quem pede é
// administrador (ver lib/admin/guard.ts). Um teste (e2e/admin-access.spec.ts)
// falha se qualquer outro ficheiro o importar.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

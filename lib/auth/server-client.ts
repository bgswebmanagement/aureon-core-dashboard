import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { COOKIE_OPTIONS, getAuthEnv } from "./config";

// Cliente Supabase com a SESSÃO de quem faz o pedido (chave anon + cookies).
// Criado de novo em cada pedido: nunca se guarda um cliente de um utilizador
// numa variável global. Devolve null se o login não estiver configurado.
export function createSessionClient() {
  const env = getAuthEnv();
  if (!env) return null;

  const cookieStore = cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...COOKIE_OPTIONS })
          );
        } catch {
          // Num Server Component não se podem escrever cookies; o middleware
          // já renova a sessão em cada pedido.
        }
      }
    }
  });
}

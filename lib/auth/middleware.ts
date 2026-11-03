import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_OPTIONS, getAuthEnv } from "./config";

// Só RENOVA a sessão (o token expira de hora a hora e o cookie tem de ser
// atualizado). NÃO decide quem pode ver o quê: nenhuma rota é bloqueada aqui.
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = getAuthEnv();
  if (!env) return response;

  // Sem cookie de sessão não há nada para renovar (evita uma chamada de rede
  // em cada visita anónima).
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasSession) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, ...COOKIE_OPTIONS })
        );
      }
    }
  });

  try {
    // getUser() valida o token no servidor do Supabase (getSession() não valida).
    await supabase.auth.getUser();
  } catch {
    // Se o Supabase não responder, a página carrega na mesma.
  }
  return response;
}

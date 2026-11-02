import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { COOKIE_OPTIONS, getAuthEnv } from "./config";

// Cliente para Route Handlers: lê os cookies do pedido e GUARDA os que o
// Supabase quer escrever, para os aplicarmos à resposta final (que só sabemos
// qual é — redirecionamento por papel — depois de verificar o código).
export function createRouteClient(request: NextRequest) {
  const env = getAuthEnv();
  if (!env) return null;

  const pending: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        pending.push(...cookiesToSet);
      }
    }
  });

  return {
    supabase,
    applyCookies(response: NextResponse): NextResponse {
      for (const { name, value, options } of pending) {
        response.cookies.set(name, value, { ...options, ...COOKIE_OPTIONS });
      }
      return response;
    }
  };
}

// Os formulários POST (entrar/sair) só são aceites se vierem do próprio site.
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

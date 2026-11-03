import { NextResponse, type NextRequest } from "next/server";
import { homeForRole, isAllowedOtpType, isRole, TOKEN_HASH_RE } from "@/lib/auth/config";
import { createRouteClient, isSameOrigin } from "@/lib/auth/route-client";

export const dynamic = "force-dynamic";

// Verifica o código do link (só depois do clique em "Entrar"), cria a sessão
// e leva a pessoa para a página do seu papel. O destino é sempre calculado
// aqui a partir do papel: nunca aceita um destino vindo do pedido.
export async function POST(request: NextRequest) {
  const redirectTo = (path: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = search;
    return NextResponse.redirect(url, 303);
  };

  if (!isSameOrigin(request)) return new NextResponse("Pedido recusado.", { status: 403 });

  const client = createRouteClient(request);
  if (!client) return redirectTo("/login");

  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "");
  if (!TOKEN_HASH_RE.test(tokenHash) || !isAllowedOtpType(type)) return redirectTo("/login", "?erro=link");

  const { data, error } = await client.supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return redirectTo("/login", "?erro=link");

  const { data: profile } = await client.supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  const role = isRole(profile?.role) ? profile.role : null;

  return client.applyCookies(redirectTo(homeForRole(role)));
}

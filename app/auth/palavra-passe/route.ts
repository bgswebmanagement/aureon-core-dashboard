import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient, isSameOrigin } from "@/lib/auth/route-client";

export const dynamic = "force-dynamic";

// Entrada do ADMINISTRADOR com email + palavra-passe. Donos e inquilinos
// continuam a entrar só por link no email: esta rota recusa qualquer conta
// que não tenha `profiles.role = 'admin'`.
//
// TODAS as falhas têm exatamente a mesma resposta (redireciona para
// /login?erro=senha, sem cookies): email que não existe, palavra-passe errada,
// conta desativada, conta que não é de administrador, campos vazios… Assim
// não se revela se um email existe nem porque falhou. A palavra-passe nunca
// vai para a URL, para a resposta nem para os registos (esta rota não regista
// nada sobre o pedido).
export async function POST(request: NextRequest) {
  const toLogin = (search: string) => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = search;
    return url;
  };
  const noStore = (response: NextResponse) => {
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  const failure = () => noStore(NextResponse.redirect(toLogin("?erro=senha"), 303));

  // Só formulários do próprio site (Sec-Fetch-Site), como em /auth/entrar.
  if (!isSameOrigin(request)) return new NextResponse("Pedido recusado.", { status: 403 });

  let email = "";
  let password = "";
  try {
    const form = await request.formData();
    email = String(form.get("email") ?? "").trim().toLowerCase();
    password = String(form.get("password") ?? "");
  } catch {
    return failure();
  }
  if (!email || email.length > 254 || !password || password.length > 1024) return failure();

  const client = createRouteClient(request);
  if (!client) return failure();

  const { data, error } = await client.supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return failure();

  // Só administradores. Qualquer outra conta: fecha a sessão acabada de abrir
  // (no Supabase) e NÃO envia nenhum cookie ao browser.
  const { data: profile, error: profileError } = await client.supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    try {
      await client.supabase.auth.signOut();
    } catch {
      // a sessão não chega ao browser de qualquer forma
    }
    return failure();
  }

  const adminUrl = request.nextUrl.clone();
  adminUrl.pathname = "/admin";
  adminUrl.search = "";
  return client.applyCookies(noStore(NextResponse.redirect(adminUrl, 303)));
}

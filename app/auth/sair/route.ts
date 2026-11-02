import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient, isSameOrigin } from "@/lib/auth/route-client";

export const dynamic = "force-dynamic";

// Termina a sessão. Só aceita POST (um link ou imagem não consegue fazer sair
// alguém) e só a partir do próprio site.
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Pedido recusado.", { status: 403 });

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const response = NextResponse.redirect(url, 303);

  const client = createRouteClient(request);
  if (!client) return response;

  try {
    await client.supabase.auth.signOut();
  } catch {
    // Mesmo que o Supabase não responda, os cookies locais são apagados abaixo.
  }
  return client.applyCookies(response);
}

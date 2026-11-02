"use server";

import { headers } from "next/headers";
import { createSessionClient } from "@/lib/auth/server-client";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// Endereço do site de onde o pedido veio (produção, preview, .pt/.ch no
// futuro). O Supabase só o aceita se estiver na lista de Redirect URLs; se
// não estiver, usa o Site URL.
function currentOrigin(): string | null {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || !HOST_RE.test(host)) return null;
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = local ? "http" : (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  return `${proto}://${host}`;
}

// Pede o link de acesso. Só entra quem já foi convidado (shouldCreateUser:
// false). A resposta é SEMPRE a mesma, exista o email ou não, para não
// revelar quem tem conta. Só um erro do servidor (5xx) é mostrado como erro.
export async function requestLink(formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { status: "error", message: "Indique um email válido." };
  }

  const supabase = createSessionClient();
  const origin = currentOrigin();
  if (!supabase || !origin) {
    return { status: "error", message: "O início de sessão ainda não está disponível neste ambiente." };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` }
  });

  if (error && (error.status === undefined || error.status >= 500)) {
    console.error("[login] falha ao enviar o link:", error.status, error.code);
    return { status: "error", message: "Não foi possível enviar o link agora. Tente novamente dentro de instantes." };
  }

  // Sucesso, email sem convite (4xx) e limite de pedidos (429) dão a mesma resposta.
  return { status: "sent" };
}

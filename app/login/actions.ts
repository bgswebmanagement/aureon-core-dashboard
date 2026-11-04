"use server";

import { currentOrigin } from "@/lib/auth/origin";
import { createSessionClient } from "@/lib/auth/server-client";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

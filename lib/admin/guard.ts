import "server-only";
import { redirect } from "next/navigation";
import { homeForRole } from "@/lib/auth/config";
import { adminStage, pathForStage, type AdminStage } from "@/lib/auth/mfa";
import { createSessionClient } from "@/lib/auth/server-client";
import { getCurrentAccount, getMfaFactors } from "@/lib/auth/session";
import { createAdminClient, type AdminClient } from "./service-client";
import type { ActionResult } from "./types";

export type AdminIdentity = { id: string; email: string | null };

export class NotAdminError extends Error {
  constructor() {
    super("Sem permissão.");
  }
}

// O passo em que está o administrador (ok / falta o código / falta inscrever o
// telemóvel). Vem sempre da sessão validada no servidor.
export async function getAdminStage(): Promise<{ identity: AdminIdentity; stage: AdminStage } | null> {
  const account = await getCurrentAccount();
  if (!account || account.role !== "admin") return null;
  const stage = adminStage(account.aal, await getMfaFactors());
  return { identity: { id: account.id, email: account.email }, stage };
}

// Confirma, no servidor e em cada chamada, que quem pede é administrador COM O
// SEGUNDO FATOR feito:
//   1) a sessão é validada no Supabase (getUser com o token, não só o cookie);
//   2) o papel vem de `profiles` (lido com a sessão da própria pessoa);
//   3) tem de ser exatamente 'admin';
//   4) a sessão tem de ser aal2 (palavra-passe/link + código de 6 dígitos) e a
//      conta tem de ter pelo menos um fator verificado.
// Não confia em nada que venha do browser (nem do layout da página).
export async function assertAdmin(): Promise<AdminIdentity> {
  const state = await getAdminStage();
  if (!state || state.stage !== "ok") throw new NotAdminError();
  return state.identity;
}

// Para páginas e layouts: sem sessão vai para /login; com sessão mas sem ser
// administrador volta à página do seu papel; administrador sem o código vai
// pedir o código (ou inscrever o telemóvel, se ainda não o fez).
export async function requireAdminPage(): Promise<AdminIdentity> {
  try {
    return await assertAdmin();
  } catch (error) {
    if (!(error instanceof NotAdminError)) throw error;
    const state = await getAdminStage();
    if (state && state.stage !== "ok") redirect(pathForStage(state.stage));
    const account = await getCurrentAccount();
    redirect(account ? homeForRole(account.role) : "/login");
  }
}

// Para ações do servidor: TODAS as ações de /admin passam por aqui. A
// verificação de administrador (com aal2) corre primeiro e só depois é criado o
// cliente de administração, por isso a chave de serviço nunca é usada para um
// pedido de alguém que não seja administrador com o segundo fator feito.
export async function withAdmin(
  handler: (context: { admin: AdminIdentity; db: AdminClient }) => Promise<ActionResult>
): Promise<ActionResult> {
  let admin: AdminIdentity;
  try {
    admin = await assertAdmin();
  } catch (error) {
    if (error instanceof NotAdminError) return { ok: false, error: "Sem permissão." };
    throw error;
  }

  const db = createAdminClient();
  if (!db) return { ok: false, error: "A chave de administração não está configurada neste ambiente." };

  return handler({ admin, db });
}

// Para ações de /admin que só precisam da SESSÃO do administrador (por exemplo,
// gerir os seus próprios fatores de segurança): mesma verificação (aal2), mas
// SEM a chave de administração.
export async function withAdminSession<T extends ActionResult>(
  handler: (context: { admin: AdminIdentity; db: NonNullable<ReturnType<typeof createSessionClient>> }) => Promise<T>
): Promise<T | ActionResult> {
  let admin: AdminIdentity;
  try {
    admin = await assertAdmin();
  } catch (error) {
    if (error instanceof NotAdminError) return { ok: false, error: "Sem permissão." };
    throw error;
  }

  const db = createSessionClient();
  if (!db) return { ok: false, error: "O início de sessão não está configurado neste ambiente." };

  return handler({ admin, db });
}

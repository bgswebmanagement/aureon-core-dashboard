import "server-only";
import { redirect } from "next/navigation";
import { homeForRole } from "@/lib/auth/config";
import { getCurrentAccount } from "@/lib/auth/session";
import { createAdminClient, type AdminClient } from "./service-client";
import type { ActionResult } from "./types";

export type AdminIdentity = { id: string; email: string | null };

export class NotAdminError extends Error {
  constructor() {
    super("Sem permissão.");
  }
}

// Confirma, no servidor e em cada chamada, que quem pede é administrador:
//   1) a sessão é validada no Supabase (getUser, não só o cookie);
//   2) o papel vem de `profiles` (lido com a sessão da própria pessoa);
//   3) tem de ser exatamente 'admin'.
// Não confia em nada que venha do browser (nem do layout da página).
export async function assertAdmin(): Promise<AdminIdentity> {
  const account = await getCurrentAccount();
  if (!account || account.role !== "admin") throw new NotAdminError();
  return { id: account.id, email: account.email };
}

// Para páginas e layouts: sem sessão vai para /login; com sessão mas sem ser
// administrador volta à página do seu papel.
export async function requireAdminPage(): Promise<AdminIdentity> {
  try {
    return await assertAdmin();
  } catch (error) {
    if (!(error instanceof NotAdminError)) throw error;
    const account = await getCurrentAccount();
    redirect(account ? homeForRole(account.role) : "/login");
  }
}

// Para ações do servidor: TODAS as ações de /admin passam por aqui. A
// verificação de administrador corre primeiro e só depois é criado o cliente
// de administração, por isso a chave de serviço nunca é usada para um pedido
// de alguém que não seja administrador.
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

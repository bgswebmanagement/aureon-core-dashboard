import "server-only";
import { redirect } from "next/navigation";
import { getAdminReader } from "@/lib/admin/reader";
import { getCurrentAccount } from "@/lib/auth/session";
import type { DataReader } from "@/lib/data";
import { getSessionReader } from "@/lib/session-reader";

// Quem pode ler dados de um relatório, e com que identidade:
//   sem sessão → /login · conta sem papel → /sem-acesso
//   administrador → lê com o âmbito de administrador (qualquer casa)
//   dono ou inquilino → lê com a SUA sessão: a base de dados só devolve as casas
//   de que é membro, por isso uma casa alheia é igual a uma casa que não existe.
export async function requireReportReader(): Promise<DataReader> {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (!account.role) redirect("/sem-acesso");
  if (account.role === "admin") return getAdminReader();
  return getSessionReader();
}

// Casa alheia e casa inexistente têm EXATAMENTE a mesma resposta.
export const REPORT_DENIED_URL = "/sem-acesso?motivo=relatorio";

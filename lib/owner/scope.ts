import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { homeForRole } from "@/lib/auth/config";
import { getCurrentAccount, type Account } from "@/lib/auth/session";
import { createDataReader, type DataReader } from "@/lib/data";
import { sessionScope } from "@/lib/data-scope";

// Um leitor de dados com a SESSÃO do dono, criado uma vez por pedido (React
// cache) e nunca guardado de forma global.
const ownerReader = cache(() => createDataReader(sessionScope()));

// Para o layout e para TODAS as páginas de /proprietario (como o requireAdminPage
// de /admin; o layout sozinho não protege as páginas):
//   sem sessão → /login · administrador → /admin · inquilino → /inquilino ·
//   conta sem papel → /sem-acesso · dono → devolve a conta e o leitor de dados.
// Os dados são lidos com a sessão do dono; quem decide o que ele vê é a base de
// dados (casas dele, consentimento do inquilino), não esta aplicação.
export async function requireOwnerScope(): Promise<{ account: Account; data: DataReader }> {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (account.role !== "owner") redirect(homeForRole(account.role));
  return { account, data: ownerReader() };
}

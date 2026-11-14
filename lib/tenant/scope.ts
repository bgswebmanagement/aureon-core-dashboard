import "server-only";
import { redirect } from "next/navigation";
import { homeForRole } from "@/lib/auth/config";
import { getCurrentAccount, type Account } from "@/lib/auth/session";
import type { DataReader } from "@/lib/data";
import { getSessionReader } from "@/lib/session-reader";
import type { Property } from "@/lib/types";

export type TenantScope = {
  account: Account;
  data: DataReader;
  // A casa do inquilino: a PRIMEIRA por ordem do nome (um inquilino normal tem
  // uma só). undefined = ainda não tem nenhuma casa associada.
  property: Property | undefined;
  totalProperties: number;
  // true = a leitura falhou: o layout mostra um erro claro (nunca dados inventados).
  failed: boolean;
};

// A casa do inquilino, lida com a SESSÃO dele: a base de dados só devolve as
// casas de que é membro. Escolhe a primeira por ordem do nome. Partilhado pelas
// páginas e pelas ações do servidor, para ambos usarem sempre a mesma casa.
export async function loadTenantHouse(data: DataReader): Promise<{ property: Property | undefined; totalProperties: number }> {
  const properties = [...(await data.getProperties())].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return { property: properties[0], totalProperties: properties.length };
}

// Para o layout e para TODAS as páginas de /inquilino (o layout sozinho não
// protege as páginas):
//   sem sessão → /login · administrador → /admin · dono → /proprietario ·
//   conta sem papel → /sem-acesso · inquilino → devolve a conta, o leitor de
//   dados e a sua casa.
// Os dados são lidos com a sessão do inquilino; quem decide o que ele vê é a
// base de dados (só as casas de que é membro), não esta aplicação.
export async function requireTenantScope(): Promise<TenantScope> {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (account.role !== "tenant") redirect(homeForRole(account.role));
  const data = getSessionReader();
  try {
    const { property, totalProperties } = await loadTenantHouse(data);
    return { account, data, property, totalProperties, failed: false };
  } catch {
    return { account, data, property: undefined, totalProperties: 0, failed: true };
  }
}

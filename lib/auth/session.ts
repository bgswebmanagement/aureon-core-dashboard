import "server-only";
import { cache } from "react";
import { isRole, type Role } from "./config";
import { decodeAal, type Aal, type MfaFactor } from "./mfa";
import { createSessionClient } from "./server-client";

export type Account = { id: string; email: string | null; role: Role | null; aal: Aal | null };

// A sessão VALIDADA no servidor, uma vez por pedido:
//   1) lê o token de acesso do cookie;
//   2) pede ao Supabase que valide ESSE MESMO token (getUser(token)) — um token
//      forjado, expirado ou de uma sessão terminada é recusado aqui;
//   3) só então se lê o nível (`aal`) desse token e se aceitam os fatores que o
//      Supabase devolveu. Nada disto vem «só do cookie».
type Validated = {
  userId: string;
  email: string | null;
  aal: Aal | null;
  factors: MfaFactor[];
  supabase: NonNullable<ReturnType<typeof createSessionClient>>;
};

const getValidatedSession = cache(async (): Promise<Validated | null> => {
  const supabase = createSessionClient();
  if (!supabase) return null;
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    const jwt = session?.access_token;
    if (!jwt) return null;

    const {
      data: { user },
      error
    } = await supabase.auth.getUser(jwt);
    if (error || !user) return null;

    const factors: MfaFactor[] = (user.factors ?? []).map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      status: f.status === "verified" ? "verified" : "unverified",
      type: String(f.factor_type),
      createdAt: f.created_at ?? null
    }));
    return { userId: user.id, email: user.email ?? null, aal: decodeAal(jwt), factors, supabase };
  } catch {
    return null;
  }
});

// Quem está com sessão iniciada e com que papel (da tabela `profiles`, lida
// com a sessão da própria pessoa: a regra "read own profile" deixa-a ler só a
// sua linha) e com que nível de segurança (aal1 = só palavra-passe/link; aal2 =
// também o código de 6 dígitos). Devolve null sem sessão, ou se o login não
// estiver configurado. Em cache por pedido.
export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const session = await getValidatedSession();
  if (!session) return null;
  try {
    const { data } = await session.supabase.from("profiles").select("role").eq("id", session.userId).maybeSingle();
    return { id: session.userId, email: session.email, role: isRole(data?.role) ? data.role : null, aal: session.aal };
  } catch {
    return null;
  }
});

// Os fatores de dois passos da conta (só os que o Supabase devolveu ao validar a
// sessão). Fica fora de `Account` de propósito: esse objeto vai para o browser.
export const getMfaFactors = cache(async (): Promise<MfaFactor[]> => {
  const session = await getValidatedSession();
  return session?.factors ?? [];
});

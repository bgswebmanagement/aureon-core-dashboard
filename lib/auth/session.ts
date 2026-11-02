import "server-only";
import { isRole, type Role } from "./config";
import { createSessionClient } from "./server-client";

export type Account = { id: string; email: string | null; role: Role | null };

// Quem está com sessão iniciada e com que papel (da tabela `profiles`, lida
// com a sessão da própria pessoa: a regra "read own profile" deixa-a ler só a
// sua linha). Devolve null sem sessão, ou se o login não estiver configurado.
export async function getCurrentAccount(): Promise<Account | null> {
  const supabase = createSessionClient();
  if (!supabase) return null;

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    return { id: user.id, email: user.email ?? null, role: isRole(data?.role) ? data.role : null };
  } catch {
    return null;
  }
}

import "server-only";
import { isRole, type Role } from "@/lib/auth/config";
import type { AdminClient } from "./service-client";
import type { AccountStatus, ManagedAccount, PropertyOption } from "./types";

// Contas (Supabase Auth) + papel (profiles) + casas (property_members), para a
// página /admin/utilizadores. Só chamar depois de confirmar que é administrador.
export async function loadAccounts(
  db: AdminClient
): Promise<{ accounts: ManagedAccount[]; properties: PropertyOption[]; error?: string }> {
  const [usersRes, profilesRes, membersRes, propertiesRes] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 200 }),
    db.from("profiles").select("id, role"),
    db.from("property_members").select("user_id, property_id"),
    db.from("properties").select("id, name, city")
  ]);

  if (usersRes.error || profilesRes.error || membersRes.error || propertiesRes.error) {
    console.error(
      "[admin] falha ao ler contas:",
      usersRes.error?.status,
      profilesRes.error?.code,
      membersRes.error?.code,
      propertiesRes.error?.code
    );
    return { accounts: [], properties: [], error: "Não foi possível ler as contas. Tente recarregar a página." };
  }

  const roleById = new Map<string, Role>();
  for (const p of profilesRes.data ?? []) if (isRole(p.role)) roleById.set(p.id, p.role);

  const housesByUser = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    const list = housesByUser.get(m.user_id) ?? [];
    list.push(m.property_id);
    housesByUser.set(m.user_id, list);
  }

  const now = Date.now();
  const accounts: ManagedAccount[] = usersRes.data.users.map((u) => {
    const bannedUntil = (u as unknown as { banned_until?: string | null }).banned_until;
    const banned = !!bannedUntil && new Date(bannedUntil).getTime() > now;
    const status: AccountStatus = banned ? "desativado" : u.email_confirmed_at ? "ativo" : "pendente";
    return {
      id: u.id,
      email: u.email ?? "(sem email)",
      role: roleById.get(u.id) ?? null,
      status,
      lastSignInAt: u.last_sign_in_at ?? null,
      propertyIds: housesByUser.get(u.id) ?? []
    };
  });

  const order: Record<string, number> = { admin: 0, owner: 1, tenant: 2 };
  accounts.sort((a, b) => (order[a.role ?? "z"] ?? 3) - (order[b.role ?? "z"] ?? 3) || a.email.localeCompare(b.email));

  const properties = [...(propertiesRes.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return { accounts, properties };
}

import "server-only";
import type { AdminClient } from "./service-client";

// Liga um inquilino às casas na tabela `tenants` (o dono vê o nome/email do
// inquilino da sua casa por aí). Se já existir um registo com o mesmo email na
// casa, só lhe junta o user_id; senão cria-o. `insertedIds` acumula os
// registos criados, para se poderem desfazer se algo falhar mais à frente.
export async function linkTenantRecords(
  db: AdminClient,
  userId: string,
  email: string,
  name: string,
  propertyIds: string[],
  insertedIds: string[]
): Promise<void> {
  if (propertyIds.length === 0) return;

  const { data: existing, error } = await db.from("tenants").select("id, property_id, email").in("property_id", propertyIds);
  if (error) throw error;

  for (const propertyId of propertyIds) {
    const match = (existing ?? []).find((t) => t.property_id === propertyId && String(t.email).toLowerCase() === email);
    if (match) {
      const { error: updateError } = await db.from("tenants").update({ user_id: userId }).eq("id", match.id);
      if (updateError) throw updateError;
    } else {
      const { data, error: insertError } = await db
        .from("tenants")
        .insert({ property_id: propertyId, user_id: userId, name, email })
        .select("id")
        .single();
      if (insertError) throw insertError;
      insertedIds.push(data.id);
    }
  }
}

// Ao retirar uma casa a um inquilino, o registo em `tenants` fica (é um
// contacto), mas deixa de apontar para a conta.
export async function unlinkTenantRecords(db: AdminClient, userId: string, propertyIds: string[]): Promise<void> {
  if (propertyIds.length === 0) return;
  const { error } = await db.from("tenants").update({ user_id: null }).eq("user_id", userId).in("property_id", propertyIds);
  if (error) throw error;
}

// Desfaz um convite que ficou a meio (a conta foi criada mas gravar o papel ou
// as casas falhou): sem isto ficava uma conta sem perfil. Cada passo é
// tentado mesmo que o anterior falhe.
export async function rollbackInvite(db: AdminClient, userId: string, insertedTenantIds: string[]): Promise<void> {
  const steps: (() => PromiseLike<unknown>)[] = [
    () => (insertedTenantIds.length ? db.from("tenants").delete().in("id", insertedTenantIds) : Promise.resolve()),
    () => db.from("tenants").update({ user_id: null }).eq("user_id", userId),
    () => db.from("property_members").delete().eq("user_id", userId),
    () => db.from("profiles").delete().eq("id", userId),
    () => db.auth.admin.deleteUser(userId)
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      console.error("[admin] passo do rollback do convite falhou:", error instanceof Error ? error.message : "erro");
    }
  }
}

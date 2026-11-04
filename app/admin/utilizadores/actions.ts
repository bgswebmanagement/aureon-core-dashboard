"use server";

import { revalidatePath } from "next/cache";
import { createClient, type User } from "@supabase/supabase-js";
import { withAdmin, type AdminIdentity } from "@/lib/admin/guard";
import { linkTenantRecords, rollbackInvite, unlinkTenantRecords } from "@/lib/admin/membership";
import type { AdminClient } from "@/lib/admin/service-client";
import type { ActionResult } from "@/lib/admin/types";
import { isInvitableRole, parseEmail, parseName, parsePropertyIds, UUID_RE, type InvitableRole } from "@/lib/admin/validation";
import { currentOrigin } from "@/lib/auth/origin";

// REGRA: toda a ação deste ficheiro começa por `withAdmin(...)`, que verifica
// no servidor que quem pede é administrador ANTES de fazer o que quer que
// seja (e antes de criar o cliente com a chave de administração). Nunca se
// confia no que o browser diz sobre quem é ou que papel tem.

const fail = (error: string): ActionResult => ({ ok: false, error });
const PATH = "/admin/utilizadores";

async function propertiesExist(db: AdminClient, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const { data, error } = await db.from("properties").select("id").in("id", ids);
  return !error && (data?.length ?? 0) === ids.length;
}

type Target = { ok: true; role: InvitableRole; user: User; email: string } | { ok: false; error: string };

// A conta sobre a qual se age: tem de existir, ser de proprietário/inquilino
// (as de administrador gerem-se à mão) e não pode ser a do próprio
// administrador (para não se desativar ou trancar a si mesmo).
async function loadTarget(db: AdminClient, admin: AdminIdentity, userId: unknown): Promise<Target> {
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { ok: false, error: "Conta inválida." };
  if (userId === admin.id) return { ok: false, error: "Não pode alterar a sua própria conta aqui." };

  const { data: profile, error } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) return { ok: false, error: "Não foi possível ler a conta." };
  if (!profile || !isInvitableRole(profile.role)) {
    return { ok: false, error: "Só se gerem aqui contas de proprietário e inquilino." };
  }

  const { data: found, error: userError } = await db.auth.admin.getUserById(userId);
  if (userError || !found.user?.email) return { ok: false, error: "Conta não encontrada." };
  return { ok: true, role: profile.role, user: found.user, email: found.user.email.toLowerCase() };
}

// Convida por email: cria a conta (Supabase envia o email "Invite user"), grava
// o papel em `profiles`, as casas em `property_members` e, para inquilinos, o
// user_id em `tenants`. Se algo falhar a meio, a conta é apagada (sem contas
// órfãs sem perfil).
export async function inviteUser(formData: FormData): Promise<ActionResult> {
  return withAdmin(async ({ db }) => {
    const email = parseEmail(formData.get("email"));
    const role = formData.get("role");
    const propertyIds = parsePropertyIds(formData.getAll("propertyIds"));
    if (!email) return fail("Indique um email válido.");
    if (!isInvitableRole(role)) return fail("Escolha o papel: proprietário ou inquilino.");
    if (!propertyIds) return fail("Casas inválidas.");
    const origin = currentOrigin();
    if (!origin) return fail("Não foi possível determinar o endereço do site.");
    if (!(await propertiesExist(db, propertyIds))) return fail("Uma das casas escolhidas não existe.");
    const name = parseName(formData.get("name"), email);

    const { data: invited, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/confirm`
    });
    if (inviteError || !invited?.user) {
      const exists = inviteError?.code === "email_exists" || /already|registered|exists/i.test(inviteError?.message ?? "");
      console.error("[admin] convite falhou:", inviteError?.status, inviteError?.code);
      return fail(
        exists ? "Este email já tem conta. Use «Reenviar link» na lista." : "Não foi possível enviar o convite. Tente novamente."
      );
    }

    const userId = invited.user.id;
    const insertedTenantIds: string[] = [];
    try {
      const { error: profileError } = await db.from("profiles").insert({ id: userId, role });
      if (profileError) throw profileError;

      if (propertyIds.length > 0) {
        const rows = propertyIds.map((propertyId) => ({ user_id: userId, property_id: propertyId }));
        const { error: membersError } = await db.from("property_members").insert(rows);
        if (membersError) throw membersError;
      }

      if (role === "tenant") await linkTenantRecords(db, userId, email, name, propertyIds, insertedTenantIds);
    } catch (error) {
      console.error("[admin] gravar o convite falhou, a desfazer:", error instanceof Error ? error.message : "erro");
      await rollbackInvite(db, userId, insertedTenantIds);
      return fail("Não foi possível gravar o convite. Nada foi criado; tente novamente.");
    }

    revalidatePath(PATH);
    const semCasas = propertyIds.length === 0 ? " Ainda sem casas associadas." : "";
    return { ok: true, message: `Convite enviado para ${email}.${semCasas}` };
  });
}

// Volta a enviar um link de acesso. Convite ainda não aceite: reenvia o
// convite. Conta já ativa: envia o link normal de entrada.
export async function resendLink(userId: string): Promise<ActionResult> {
  return withAdmin(async ({ admin, db }) => {
    const target = await loadTarget(db, admin, userId);
    if (!target.ok) return fail(target.error);

    const bannedUntil = (target.user as unknown as { banned_until?: string | null }).banned_until;
    if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) {
      return fail("A conta está desativada. Reative-a primeiro.");
    }
    const origin = currentOrigin();
    if (!origin) return fail("Não foi possível determinar o endereço do site.");
    const redirectTo = `${origin}/auth/confirm`;

    let error: { status?: number; code?: string } | null;
    if (!target.user.email_confirmed_at) {
      ({ error } = await db.auth.admin.inviteUserByEmail(target.email, { redirectTo }));
    } else {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) return fail("O início de sessão não está configurado neste ambiente.");
      const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      ({ error } = await anon.auth.signInWithOtp({
        email: target.email,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo }
      }));
    }

    if (error) {
      console.error("[admin] reenvio falhou:", error.status, error.code);
      return fail(
        error.status === 429
          ? "Foi pedido há pouco tempo. Aguarde um minuto e tente de novo."
          : "Não foi possível enviar o link. Tente novamente."
      );
    }
    return { ok: true, message: `Link enviado para ${target.email}.` };
  });
}

// Define as casas de uma conta (substitui a lista). Para inquilinos, mantém
// `tenants.user_id` em sincronia.
export async function setUserProperties(userId: string, propertyIds: string[]): Promise<ActionResult> {
  return withAdmin(async ({ admin, db }) => {
    const target = await loadTarget(db, admin, userId);
    if (!target.ok) return fail(target.error);

    const wanted = parsePropertyIds(Array.isArray(propertyIds) ? propertyIds : []);
    if (!wanted) return fail("Casas inválidas.");
    if (!(await propertiesExist(db, wanted))) return fail("Uma das casas escolhidas não existe.");

    const { data: current, error: readError } = await db.from("property_members").select("property_id").eq("user_id", userId);
    if (readError) return fail("Não foi possível ler as casas atuais.");
    const have = new Set((current ?? []).map((row) => row.property_id as string));
    const toAdd = wanted.filter((id) => !have.has(id));
    const toRemove = Array.from(have).filter((id) => !wanted.includes(id));
    if (toAdd.length === 0 && toRemove.length === 0) return { ok: true, message: "Sem alterações." };

    if (toAdd.length > 0) {
      const { error: addError } = await db
        .from("property_members")
        .insert(toAdd.map((propertyId) => ({ user_id: userId, property_id: propertyId })));
      if (addError) return fail("Não foi possível associar as casas.");

      if (target.role === "tenant") {
        try {
          const { data: own } = await db.from("tenants").select("name").eq("user_id", userId).limit(1);
          const name = parseName(own?.[0]?.name, target.email);
          await linkTenantRecords(db, userId, target.email, name, toAdd, []);
        } catch (error) {
          console.error("[admin] ligar inquilino falhou, a desfazer:", error instanceof Error ? error.message : "erro");
          await db.from("property_members").delete().eq("user_id", userId).in("property_id", toAdd);
          return fail("Não foi possível ligar o inquilino às casas. Nada foi alterado.");
        }
      }
    }

    if (toRemove.length > 0) {
      const { error: removeError } = await db.from("property_members").delete().eq("user_id", userId).in("property_id", toRemove);
      if (removeError) return fail("As casas novas foram associadas, mas não foi possível retirar as outras. Tente de novo.");
      if (target.role === "tenant") {
        try {
          await unlinkTenantRecords(db, userId, toRemove);
        } catch {
          return fail("Casas retiradas, mas o registo do inquilino não foi atualizado. Tente de novo.");
        }
      }
    }

    revalidatePath(PATH);
    return { ok: true, message: "Casas atualizadas." };
  });
}

// Desativa/reativa o acesso (a conta e os dados ficam). Quem já tem a sessão
// aberta pode continuar até ao fim do prazo do token (até 1 hora); depois não
// consegue renovar nem pedir novos links.
export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  return withAdmin(async ({ admin, db }) => {
    const target = await loadTarget(db, admin, userId);
    if (!target.ok) return fail(target.error);

    const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: active === true ? "none" : "876000h" });
    if (error) {
      console.error("[admin] alterar estado falhou:", error.status, error.code);
      return fail("Não foi possível alterar o estado da conta.");
    }

    revalidatePath(PATH);
    return {
      ok: true,
      message:
        active === true
          ? `Conta de ${target.email} reativada.`
          : `Conta de ${target.email} desativada. Uma sessão já aberta pode durar até 1 hora.`
    };
  });
}

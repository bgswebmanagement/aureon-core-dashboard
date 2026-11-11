"use server";

import { getCurrentAccount } from "@/lib/auth/session";
import { createSessionClient } from "@/lib/auth/server-client";
import { getSessionReader } from "@/lib/session-reader";
import { loadTenantHouse } from "@/lib/tenant/scope";

// Dar e retirar autorizações ao proprietário. GARANTIAS (testadas em
// e2e/consent-actions.spec.ts):
//  • só chama quem tem papel «tenant» (verificado aqui, no servidor, em cada
//    chamada — nunca se confia no browser);
//  • a CASA vem sempre da sessão do inquilino, nunca do que o browser envia:
//    qualquer outro argumento é ignorado;
//  • só as categorias motion, doorWindow e sound;
//  • escreve com a SESSÃO do inquilino (nunca com a chave de administração), por
//    isso as regras da base de dados (inquilino + membro da casa) valem sempre;
//  • sem prazo no piloto: expires_at fica vazio e o inquilino retira quando quiser.

export type ConsentResult = { ok: boolean; message?: string; error?: string };

const CATEGORIES = ["motion", "doorWindow", "sound"] as const;
type Category = (typeof CATEGORIES)[number];
const MAX_REASON = 200;

const fail = (error: string): ConsentResult => ({ ok: false, error });
const isCategory = (value: unknown): value is Category => typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);

export async function setConsent(category: unknown, action: unknown, reason?: unknown): Promise<ConsentResult> {
  // 1) Quem pede: tem de ser inquilino, com uma casa.
  const account = await getCurrentAccount();
  if (!account || account.role !== "tenant") return fail("Sem permissão.");
  const db = createSessionClient();
  if (!db) return fail("O início de sessão não está configurado neste ambiente.");
  let propertyId: string;
  try {
    const { property } = await loadTenantHouse(getSessionReader());
    if (!property) return fail("Sem permissão.");
    propertyId = property.id; // a casa vem SEMPRE daqui
  } catch {
    return fail("Não foi possível ler os dados. Tente novamente.");
  }

  // 2) O que se pede: só valores conhecidos.
  if (!isCategory(category)) return fail("Categoria inválida.");
  if (action !== "grant" && action !== "revoke") return fail("Ação inválida.");

  if (action === "revoke") {
    const { data, error } = await db
      .from("consent_grants")
      .update({ active: false })
      .eq("property_id", propertyId)
      .eq("category", category)
      .eq("active", true)
      .select("id");
    if (error) {
      console.error("[consent] retirar falhou:", error.code);
      return fail("Não foi possível retirar a autorização. Tente novamente.");
    }
    return { ok: true, message: (data?.length ?? 0) > 0 ? "Autorização retirada." : "Esta autorização já tinha sido retirada." };
  }

  // 3) Conceder. O motivo é opcional e curto.
  let motivo: string | null = null;
  if (reason !== undefined && reason !== null && reason !== "") {
    if (typeof reason !== "string") return fail("Motivo inválido.");
    // eslint-disable-next-line no-control-regex
    const limpo = reason.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (limpo.length > MAX_REASON) return fail(`O motivo é demasiado longo (máximo ${MAX_REASON} letras).`);
    motivo = limpo || null;
  }

  // Só pode haver UMA autorização ativa por casa e categoria — e o índice conta
  // também as expiradas. Por isso, antes de criar, desativa-se a expirada.
  const { error: expiredError } = await db
    .from("consent_grants")
    .update({ active: false })
    .eq("property_id", propertyId)
    .eq("category", category)
    .eq("active", true)
    .lt("expires_at", new Date().toISOString());
  if (expiredError) {
    console.error("[consent] limpar expirada falhou:", expiredError.code);
    return fail("Não foi possível guardar a autorização. Tente novamente.");
  }

  const { error } = await db
    .from("consent_grants")
    .insert({ property_id: propertyId, category, reason: motivo, expires_at: null, active: true });
  if (error) {
    if (error.code === "23505") {
      // Já há uma ativa (por exemplo, outra pessoa da casa acabou de a dar).
      return fail("Esta autorização já está ativa (talvez outra pessoa da casa a tenha acabado de dar). A página vai atualizar.");
    }
    console.error("[consent] conceder falhou:", error.code);
    return fail("Não foi possível guardar a autorização. Tente novamente.");
  }
  return { ok: true, message: "Autorização guardada." };
}

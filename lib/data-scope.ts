import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSessionClient } from "@/lib/auth/server-client";
import { getSupabaseServiceClient } from "./supabase";

// ---------------------------------------------------------------------------
// ÂMBITO DE LEITURA ("scope"): com que identidade se leem os dados.
//
//   admin   — chave de administração. Só se obtém por lib/admin/data-scope.ts,
//             que confirma primeiro que quem pede é administrador.
//   session — a sessão da própria pessoa (chave anon + cookies). As regras da
//             base de dados decidem o que ela vê (casas, consentimento…).
//   legacy  — TEMPORÁRIO: a leitura antiga com a chave de administração, sem
//             login. Só o /inquilino a usa, até ao PR 5 (inquilino com sessão).
//             Nada novo deve usá-la.
//
// Um âmbito vale para UM pedido: cria-se de novo em cada pedido e nunca se
// guarda numa variável global (nada de dados partilhados entre utilizadores).
// ---------------------------------------------------------------------------

export type DbClient = SupabaseClient<any, "public", any>;

export type DataScope = {
  kind: "admin" | "session" | "legacy";
  db: DbClient | null;
  // Tabela (ou vista) de onde se leem as leituras do hub e os satélites.
  // Com sessão lê-se SEMPRE das vistas, que escondem o que o consentimento
  // não permite; as tabelas de base só se leem com a chave de administração.
  readingsTable: "sensor_readings" | "sensor_readings_visible";
  satellitesTable: "satellites" | "satellites_visible";
  // Só o âmbito legacy cai para os dados de demonstração quando falha.
  // Com sessão ou admin, uma falha é um erro claro, nunca dados inventados.
  allowDemoFallback: boolean;
};

export class DataUnavailableError extends Error {
  constructor(detail: string) {
    super(`Dados indisponíveis: ${detail}`);
  }
}

export function legacyServiceScope(): DataScope {
  return {
    kind: "legacy",
    db: getSupabaseServiceClient(),
    readingsTable: "sensor_readings",
    satellitesTable: "satellites",
    allowDemoFallback: true
  };
}

export function sessionScope(): DataScope {
  return {
    kind: "session",
    db: createSessionClient(),
    readingsTable: "sensor_readings_visible",
    satellitesTable: "satellites_visible",
    allowDemoFallback: false
  };
}

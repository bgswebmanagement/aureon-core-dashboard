import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSessionClient } from "@/lib/auth/server-client";

// ---------------------------------------------------------------------------
// ÂMBITO DE LEITURA ("scope"): com que identidade se lê.
//
//   admin   — chave de administração. Só se obtém por lib/admin/data-scope.ts,
//             que confirma primeiro que quem pede é administrador.
//   session — a sessão da própria pessoa (chave anon + cookies). As regras da
//             base de dados decidem o que ela vê (casas, consentimento…). É o
//             que usam o dono, o inquilino e o relatório.
//
// Não existe mais o modo «legacy» (chave de administração sem login): um teste
// falha se alguém o reintroduzir.
//
// Um âmbito vale para UM pedido: cria-se de novo em cada pedido e nunca se
// guarda numa variável global (nada de dados partilhados entre utilizadores).
// ---------------------------------------------------------------------------

export type DbClient = SupabaseClient<any, "public", any>;

export type DataScope = {
  kind: "admin" | "session";
  db: DbClient | null;
  // Tabela (ou vista) de onde se leem as leituras do hub e os satélites.
  // Com sessão lê-se SEMPRE das vistas, que escondem o que o consentimento
  // não permite; as tabelas de base só se leem com a chave de administração.
  readingsTable: "sensor_readings" | "sensor_readings_visible";
  satellitesTable: "satellites" | "satellites_visible";
};

export class DataUnavailableError extends Error {
  constructor(detail: string) {
    super(`Dados indisponíveis: ${detail}`);
  }
}

export function sessionScope(): DataScope {
  return {
    kind: "session",
    db: createSessionClient(),
    readingsTable: "sensor_readings_visible",
    satellitesTable: "satellites_visible"
  };
}

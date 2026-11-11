import "server-only";
import type { DataScope } from "@/lib/data-scope";
import { assertAdmin } from "./guard";
import { createAdminClient } from "./service-client";

// Âmbito de leitura do administrador: chave de administração. A verificação
// de que quem pede é administrador corre PRIMEIRO; só depois se cria o
// cliente, por isso a chave nunca é usada para o pedido de outra pessoa.
export async function adminDataScope(): Promise<DataScope> {
  await assertAdmin();
  return {
    kind: "admin",
    db: createAdminClient(),
    readingsTable: "sensor_readings",
    satellitesTable: "satellites",
    allowDemoFallback: false
  };
}

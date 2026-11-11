import "server-only";
import { cache } from "react";
import { createDataReader, type DataReader } from "@/lib/data";
import { adminDataScope } from "./data-scope";

// Leitor de dados do administrador, criado uma vez por pedido (React cache).
// Só se chama DEPOIS de requireAdminPage(); adminDataScope() volta a verificar
// que quem pede é administrador antes de criar o cliente com a chave de serviço.
export const getAdminReader = cache(async (): Promise<DataReader> => createDataReader(await adminDataScope()));

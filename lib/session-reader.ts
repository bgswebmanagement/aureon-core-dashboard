import "server-only";
import { cache } from "react";
import { createDataReader } from "@/lib/data";
import { sessionScope } from "@/lib/data-scope";

// Um leitor de dados com a SESSÃO de quem faz o pedido, criado uma vez por
// pedido (React cache) e nunca guardado de forma global. Usado pelo dono, pelo
// inquilino e pelo relatório.
export const getSessionReader = cache(() => createDataReader(sessionScope()));

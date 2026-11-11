"use client";

import { DataError } from "@/components/DataError";

// Falha ao ler dados numa página do inquilino: mensagem clara, sem detalhes técnicos.
export default function TenantError() {
  return <DataError />;
}

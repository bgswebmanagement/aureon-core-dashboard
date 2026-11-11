"use client";

import { DataError } from "@/components/DataError";

// Falha ao ler dados numa página do dono: mensagem clara, sem detalhes técnicos.
export default function OwnerError() {
  return <DataError />;
}

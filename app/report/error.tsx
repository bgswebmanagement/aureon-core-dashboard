"use client";

import { DataError } from "@/components/DataError";

// Falha ao ler os dados do relatório: mensagem clara, sem detalhes técnicos.
export default function ReportError() {
  return <DataError />;
}

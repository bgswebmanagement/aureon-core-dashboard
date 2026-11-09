"use client";

import { DataError } from "@/components/DataError";

// Falha ao ler dados numa página de administração: mensagem clara.
export default function AdminError() {
  return <DataError />;
}

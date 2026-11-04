import type { Role } from "@/lib/auth/config";

// Tipos partilhados entre as ações do servidor e os componentes do browser.
export type ActionResult = { ok: boolean; message?: string; error?: string };

export type AccountStatus = "ativo" | "pendente" | "desativado";

export type ManagedAccount = {
  id: string;
  email: string;
  role: Role | null;
  status: AccountStatus;
  lastSignInAt: string | null;
  propertyIds: string[];
};

export type PropertyOption = { id: string; name: string; city: string };

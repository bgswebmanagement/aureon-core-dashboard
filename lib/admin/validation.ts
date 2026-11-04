// Validação dos dados que chegam do browser. Nada daqui é de confiança.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Só se convidam proprietários e inquilinos. Contas de administrador criam-se
// à mão (Supabase + SQL), de propósito.
export const INVITABLE_ROLES = ["owner", "tenant"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(value: unknown): value is InvitableRole {
  return value === "owner" || value === "tenant";
}

export function parseEmail(value: unknown): string | null {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export function parsePropertyIds(values: unknown[]): string[] | null {
  const ids = Array.from(new Set(values.map((v) => String(v))));
  if (ids.length > 50 || !ids.every((id) => UUID_RE.test(id))) return null;
  return ids;
}

export function parseName(value: unknown, fallbackEmail: string): string {
  const name = String(value ?? "").trim().slice(0, 100);
  return name || fallbackEmail.split("@")[0];
}

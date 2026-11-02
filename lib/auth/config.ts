// Configuração partilhada do login. Sem dependências de servidor: também corre
// no middleware (Edge). O papel de cada conta vem SEMPRE da tabela `profiles`,
// nunca de dados que o utilizador possa editar (user_metadata).

export type Role = "admin" | "owner" | "tenant";

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  owner: "/proprietario",
  tenant: "/inquilino"
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "owner" || value === "tenant";
}

// Depois do login cada pessoa vai para a página do seu papel. Conta sem papel
// atribuído vai para uma página própria.
export function homeForRole(role: Role | null): string {
  return role ? ROLE_HOME[role] : "/sem-acesso";
}

// Só estes tipos de link são aceites em /auth/confirm: o início de sessão por
// link (email/magiclink) e o convite (PR 3). Nada de recovery, signup, etc.
export const ALLOWED_OTP_TYPES = ["email", "magiclink", "invite"] as const;
export type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number];

export function isAllowedOtpType(value: unknown): value is AllowedOtpType {
  return typeof value === "string" && (ALLOWED_OTP_TYPES as readonly string[]).includes(value);
}

export const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{8,256}$/;

// Sem estas variáveis (modo demonstração, previews antigos) o login fica
// desligado e o resto da app continua a funcionar como hoje.
export function getAuthEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

// A sessão só é lida no servidor (não usamos o cliente do browser), por isso o
// cookie pode ser httpOnly.
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};

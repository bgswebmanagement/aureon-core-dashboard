// Dois fatores (TOTP) do administrador: tipos e regras simples, SEM dependências
// de servidor (também corre nos testes). Quem decide o acesso é lib/admin/guard.ts.

export type Aal = "aal1" | "aal2";

// Um fator tal como o Supabase o devolve em «user.factors» (só o que usamos).
export type MfaFactor = {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified";
  type: string;
  createdAt: string | null;
};

export const MFA_CODE_PATH = "/auth/mfa";
export const MFA_ENROLL_PATH = "/auth/mfa/inscrever";

// Lê o nível de segurança (`aal`) do token de acesso. ATENÇÃO: isto só LÊ o que
// o token diz; quem o torna fiável é o Supabase, que valida o MESMO token no
// servidor (getUser(jwt)) antes de alguém usar este valor (ver session.ts).
export function decodeAal(jwt: string | null | undefined): Aal | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { aal?: unknown };
    return payload.aal === "aal2" ? "aal2" : payload.aal === "aal1" ? "aal1" : null;
  } catch {
    return null;
  }
}

// Só contam os fatores TOTP já VERIFICADOS (um por confirmar não conta).
export function verifiedTotp(factors: MfaFactor[]): MfaFactor[] {
  return factors.filter((f) => f.type === "totp" && f.status === "verified");
}

// Em que passo está um administrador:
//   ok            — tem fator e a sessão já passou o código (aal2)
//   needs-code    — tem fator, mas a sessão só tem a palavra-passe/link (aal1)
//   needs-enroll  — ainda não tem nenhum fator verificado (tem de inscrever)
// Um token aal2 sem nenhum fator verificado NÃO chega (ex.: fator removido).
export type AdminStage = "ok" | "needs-code" | "needs-enroll";

export function adminStage(aal: Aal | null, factors: MfaFactor[]): AdminStage {
  if (verifiedTotp(factors).length === 0) return "needs-enroll";
  return aal === "aal2" ? "ok" : "needs-code";
}

export function pathForStage(stage: Exclude<AdminStage, "ok">): string {
  return stage === "needs-code" ? MFA_CODE_PATH : MFA_ENROLL_PATH;
}

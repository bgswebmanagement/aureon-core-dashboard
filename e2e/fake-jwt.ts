import { createHmac, randomUUID } from "node:crypto";

// Tokens de sessão para os testes, com forma de JWT e assinados com o mesmo
// segredo FALSO do Supabase de mentira (e2e/fake-supabase.mjs). Servem para
// escolher o nível de segurança (aal1 = só palavra-passe/link; aal2 = também o
// código de 6 dígitos). Nenhum segredo real: só funcionam contra o falso.
const FAKE_JWT_SECRET = "segredo-falso-so-para-testes";

const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

export function fakeJwt(sub: string, aal: "aal1" | "aal2", opts: { exp?: number; secret?: string; email?: string } = {}): string {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({
    sub,
    aud: "authenticated",
    role: "authenticated",
    email: opts.email ?? "x@teste.invalid",
    aal,
    amr: [{ method: aal === "aal2" ? "totp" : "password", timestamp: Math.floor(Date.now() / 1000) }],
    session_id: randomUUID(),
    exp: opts.exp ?? Math.floor(Date.now() / 1000) + 3600
  });
  const sig = createHmac("sha256", opts.secret ?? FAKE_JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

// Cookie de sessão tal como o @supabase/ssr o escreve (nome derivado do endereço do falso Supabase).
export function sessionCookieValue(user: { id: string; email: string }, accessToken: string, refresh = "ref-teste"): string {
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: refresh,
    user: { id: user.id, email: user.email, aud: "authenticated", role: "authenticated" }
  };
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}

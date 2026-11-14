import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { fakeJwt, sessionCookieValue } from "./fake-jwt";

// Dois fatores (TOTP) do administrador — o NÚCLEO: sem o código de 6 dígitos
// (sessão aal2) nenhuma página nem ação de /admin abre. Corre contra o site
// real e o Supabase falso, que imita aal1/aal2, fatores e tokens assinados.

const FAKE = "http://127.0.0.1:54329";
const ADMIN = { id: "a0000000-0000-4000-8000-000000000001", email: "admin@teste.invalid" };
const OWNER = { id: "b0000000-0000-4000-8000-000000000002", email: "dono@teste.invalid" };
const COOKIE = "sb-127-auth-token";

const ADMIN_PATHS = [
  "/admin",
  "/admin/alertas",
  "/admin/consentimentos",
  "/admin/dispositivos",
  "/admin/propriedades",
  "/admin/propriedades/qualquer-id",
  "/admin/utilizadores"
];

type Call = { method: string; path: string; query: string; service: boolean; token: string };
const log = async (r: APIRequestContext): Promise<Call[]> => (await r.get(`${FAKE}/__log`)).json();
const serviceCalls = (calls: Call[]) => calls.filter((c) => c.service);
const adminCookie = (token: string) => `${COOKIE}=${sessionCookieValue(ADMIN, token)}`;
const aal1 = () => adminCookie(fakeJwt(ADMIN.id, "aal1"));
const aal2 = () => adminCookie(fakeJwt(ADMIN.id, "aal2"));
const factors = (r: APIRequestContext, data: object) => r.post(`${FAKE}/__factors`, { data: { user: "admin", ...data } });

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/__reset`);
});

async function visit(request: APIRequestContext, cookie: string | null, url: string) {
  const res = await request.get(url, { headers: cookie ? { cookie } : {}, maxRedirects: 0 });
  return { status: res.status(), location: res.headers()["location"], html: await res.text() };
}

// ---------------------------------------------------------------------------
// 1) Só com a palavra-passe (aal1): nada de /admin abre
// ---------------------------------------------------------------------------
test("aal1 (só palavra-passe/link) com fator inscrito: todas as páginas de /admin pedem o código e nunca usam a chave de administração", async ({ request }) => {
  for (const p of ADMIN_PATHS) {
    const r = await visit(request, aal1(), p);
    expect(r.status, p).toBe(307);
    expect(r.location, p).toMatch(/\/auth\/mfa$/);
    expect(r.html, p).not.toContain("Visão Geral");
  }
  expect(serviceCalls(await log(request))).toHaveLength(0);
});

test("o relatório também: administrador aal1 vai pedir o código", async ({ request }) => {
  const r = await visit(request, aal1(), "/report/11111111-1111-4111-8111-111111111111");
  expect(r.status).toBe(307);
  expect(r.location).toMatch(/\/auth\/mfa$/);
  expect(serviceCalls(await log(request))).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 2) Sem fator: é levado à inscrição, e só ali
// ---------------------------------------------------------------------------
test("administrador SEM fator (aal1 ou aal2): todas as páginas de /admin levam à inscrição", async ({ request }) => {
  await factors(request, { action: "clear" });
  for (const cookie of [aal1(), aal2()]) {
    for (const p of ADMIN_PATHS) {
      const r = await visit(request, cookie, p);
      expect(r.status, p).toBe(307);
      expect(r.location, p).toMatch(/\/auth\/mfa\/inscrever$/);
    }
  }
  expect(serviceCalls(await log(request))).toHaveLength(0);
});

test("um fator por confirmar (inscrição abandonada) não conta: continua a ser preciso inscrever", async ({ request }) => {
  await factors(request, { action: "clear" });
  await factors(request, { action: "add", status: "unverified", name: "Abandonado" });
  const r = await visit(request, aal2(), "/admin");
  expect(r.status).toBe(307);
  expect(r.location).toMatch(/\/auth\/mfa\/inscrever$/);
});

test("um token aal2 antigo NÃO chega se a conta já não tem nenhum fator verificado (ex.: fator removido na recuperação)", async ({ request }) => {
  const antes = await visit(request, aal2(), "/admin");
  expect(antes.status).toBe(200);
  await factors(request, { action: "clear" });
  const depois = await visit(request, aal2(), "/admin");
  expect(depois.status).toBe(307);
  expect(depois.location).toMatch(/\/auth\/mfa\/inscrever$/);
});

// ---------------------------------------------------------------------------
// 3) Com o código feito (aal2) abre tudo
// ---------------------------------------------------------------------------
test("aal2 com fator: todas as páginas de /admin abrem", async ({ request }) => {
  const abertas = ADMIN_PATHS.map((p) => p.replace("qualquer-id", "11111111-1111-4111-8111-111111111111"));
  for (const p of abertas) {
    const r = await visit(request, aal2(), p);
    expect(r.status, p).toBe(200);
  }
});

// ---------------------------------------------------------------------------
// 4) O nível vem de uma sessão VALIDADA no servidor, não só do cookie
// ---------------------------------------------------------------------------
test("tokens forjados, alterados ou expirados não abrem nada: o nível aal2 escrito no cookie não vale sem o Supabase o validar", async ({ request }) => {
  const valido = fakeJwt(ADMIN.id, "aal1");
  const [h, , sig] = valido.split(".");
  const payloadAal2 = Buffer.from(
    JSON.stringify({ sub: ADMIN.id, aud: "authenticated", role: "authenticated", aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString("base64url");

  const casos: { nome: string; token: string }[] = [
    { nome: "assinado com outro segredo", token: fakeJwt(ADMIN.id, "aal2", { secret: "outro-segredo" }) },
    { nome: "aal alterado de aal1 para aal2 sem voltar a assinar", token: `${h}.${payloadAal2}.${sig}` },
    { nome: "expirado", token: fakeJwt(ADMIN.id, "aal2", { exp: Math.floor(Date.now() / 1000) - 60 }) },
    { nome: "sem assinatura", token: `${h}.${payloadAal2}.` },
    { nome: "lixo", token: "aal2" }
  ];
  for (const caso of casos) {
    for (const p of ["/admin", "/admin/utilizadores"]) {
      const r = await visit(request, adminCookie(caso.token), p);
      expect(r.status, `${caso.nome} ${p}`).toBe(307);
      expect(r.location, `${caso.nome} ${p}`).toMatch(/\/login$/);
    }
  }
  expect(serviceCalls(await log(request))).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 5) Donos e inquilinos não mudam
// ---------------------------------------------------------------------------
test("donos e inquilinos continuam só com o link (sem pedir código): as suas páginas abrem", async ({ request }) => {
  const owner = await visit(request, `${COOKIE}=${sessionCookieValue(OWNER, "tok-owner")}`, "/proprietario");
  expect(owner.status).toBe(200);
  const tenant = await visit(
    request,
    `${COOKIE}=${sessionCookieValue({ id: "c0000000-0000-4000-8000-000000000003", email: "inquilino@teste.invalid" }, "tok-tenant")}`,
    "/inquilino"
  );
  expect(tenant.status).toBe(200);
});

// ---------------------------------------------------------------------------
// Verificações estáticas: nenhum acesso a /admin ou à chave de administração escapa a esta regra
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const text = (file: string) => fs.readFileSync(file, "utf8");
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const SOURCES = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "components")), path.join(ROOT, "middleware.ts")];

test("estrutura: assertAdmin exige aal2 e fator verificado; o nível vem do token validado com getUser(token)", () => {
  const guard = text(path.join(ROOT, "lib/admin/guard.ts"));
  const assertAdmin = guard.slice(guard.indexOf("export async function assertAdmin"), guard.indexOf("export async function requireAdminPage"));
  expect(assertAdmin).toContain('state.stage !== "ok"');
  const stage = guard.slice(guard.indexOf("export async function getAdminStage"), guard.indexOf("export async function assertAdmin"));
  expect(stage).toContain('account.role !== "admin"');
  expect(stage).toContain("adminStage(account.aal");

  const mfa = text(path.join(ROOT, "lib/auth/mfa.ts"));
  expect(mfa).toContain('aal === "aal2" ? "ok" : "needs-code"');
  expect(mfa).toContain('=== 0) return "needs-enroll"'); // sem fator verificado nunca é «ok»

  const session = text(path.join(ROOT, "lib/auth/session.ts"));
  expect(session).toContain("supabase.auth.getUser(jwt)"); // valida o MESMO token de onde se lê o aal
  expect(session.indexOf("getUser(jwt)")).toBeLessThan(session.indexOf("decodeAal(jwt)"));
});

test("estrutura: a chave de administração só é criada depois de assertAdmin/requireAdminPage, numa lista fechada de sítios", () => {
  const sitios = SOURCES.filter((f) => /\bcreateAdminClient\(/.test(text(f))).map(rel).filter((f) => f !== "lib/admin/service-client.ts").sort();
  expect(sitios).toEqual(["app/admin/utilizadores/page.tsx", "lib/admin/data-scope.ts", "lib/admin/guard.ts"]);
  for (const f of sitios) {
    const source = text(path.join(ROOT, f));
    const guardIndex = Math.min(
      ...["assertAdmin()", "requireAdminPage()"].map((g) => (source.indexOf(g) === -1 ? Infinity : source.indexOf(g)))
    );
    const useIndex = source.search(/\bcreateAdminClient\(/);
    expect(guardIndex, `${f}: tem de verificar o administrador (aal2) ANTES de criar o cliente`).toBeLessThan(useIndex);
  }
});

test("estrutura: toda a ação do servidor de /admin passa por withAdmin ou withAdminSession; o layout e as páginas por requireAdminPage", () => {
  const actionFiles = walk(path.join(ROOT, "app/admin")).filter((f) => text(f).trimStart().startsWith('"use server"'));
  expect(actionFiles.length).toBeGreaterThanOrEqual(1);
  for (const f of actionFiles) {
    const parts = text(f).split(/^export async function /m).slice(1);
    expect(parts.length, rel(f)).toBeGreaterThan(0);
    for (const part of parts) {
      const body = part.slice(part.indexOf("{") + 1).trimStart();
      expect(/^return (withAdmin|withAdminSession)\(/.test(body), `${rel(f)}: ${part.slice(0, 24)}… tem de começar por return withAdmin( ou withAdminSession(`).toBe(true);
    }
  }
  const pages = walk(path.join(ROOT, "app/admin")).filter((f) => /\/(page|layout)\.tsx$/.test(f.split(path.sep).join("/")));
  const sem = pages.filter((f) => !text(f).includes("await requireAdminPage()")).map(rel);
  expect(sem).toEqual([]);
});

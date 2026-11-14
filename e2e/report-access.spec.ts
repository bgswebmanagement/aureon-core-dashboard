import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { fakeJwt } from "./fake-jwt";

// /report/[id] exige login: administrador (qualquer casa) ou dono/inquilino
// membro da casa. Casa alheia e casa inexistente têm a MESMA resposta. O
// relatório é sempre o documento do dono: eventos de movimento/porta só com
// autorização do inquilino, mesmo para o administrador e o inquilino.

const FAKE = "http://127.0.0.1:54329";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const INEXISTENTE = "99999999-9999-4999-8999-999999999999";
const NEGADO = /\/sem-acesso\?motivo=relatorio$/;

type Who = "admin" | "owner" | "owner0" | "tenant" | "norole";
const USERS: Record<Who, { id: string; email: string; token: string }> = {
  admin: { id: "a0000000-0000-4000-8000-000000000001", email: "admin@teste.invalid", token: "tok-admin" },
  owner: { id: "b0000000-0000-4000-8000-000000000002", email: "dono@teste.invalid", token: "tok-owner" },
  owner0: { id: "80000000-0000-4000-8000-000000000008", email: "dono-sem-casas@teste.invalid", token: "tok-owner0" },
  tenant: { id: "c0000000-0000-4000-8000-000000000003", email: "inquilino@teste.invalid", token: "tok-tenant" },
  norole: { id: "d0000000-0000-4000-8000-000000000004", email: "semperfil@teste.invalid", token: "tok-norole" }
};
function cookieFor(who: Who): string {
  const u = USERS[who];
  const session = {
    access_token: who === "admin" ? fakeJwt(u.id, "aal2") : u.token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `ref-${who}`,
    user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated" }
  };
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

type Call = { method: string; path: string; query: string; service: boolean; token: string };
const log = async (r: APIRequestContext): Promise<Call[]> => (await r.get(`${FAKE}/__log`)).json();
const grant = (r: APIRequestContext, property_id: string, category: string) =>
  r.post(`${FAKE}/__consent`, { data: { property_id, category } });

async function report(r: APIRequestContext, who: Who | null, id: string) {
  const headers: Record<string, string> = who ? { cookie: cookieFor(who) } : {};
  const res = await r.get(`/report/${id}`, { headers, maxRedirects: 0 });
  return { status: res.status(), location: res.headers()["location"], html: await res.text() };
}
// Segue o redireccionamento à mão (com o mesmo cookie), para comparar a página final.
async function reportFinal(r: APIRequestContext, who: Who, id: string) {
  const first = await report(r, who, id);
  expect(first.status).toBe(307);
  const url = new URL(first.location!, "http://localhost:3101").toString();
  const res = await r.get(url, { headers: { cookie: cookieFor(who) }, maxRedirects: 0 });
  return { status: res.status(), url, html: await res.text() };
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/__reset`);
});

test("sem sessão: vai para /login e não lê dados nenhuns", async ({ request }) => {
  for (const id of [P1, P2, INEXISTENTE]) {
    const r = await report(request, null, id);
    expect(r.status).toBe(307);
    expect(r.location).toMatch(/\/login$/);
    expect(r.html).not.toContain("Casa Um");
  }
  expect((await log(request)).filter((c) => c.path.startsWith("/rest/v1/"))).toHaveLength(0);
});

test("conta sem papel: vai para /sem-acesso, sem ler dados", async ({ request }) => {
  const r = await report(request, "norole", P1);
  expect(r.status).toBe(307);
  expect(r.location).toMatch(/\/sem-acesso$/);
  expect((await log(request)).filter((c) => c.path.startsWith("/rest/v1/") && c.path !== "/rest/v1/profiles")).toHaveLength(0);
});

test("dono da Casa Um: vê o relatório da sua casa, só com fuga (sem movimento) e sem frase de eventos escondidos", async ({ request }) => {
  const r = await report(request, "owner", P1);
  expect(r.status).toBe(200);
  expect(r.html).toContain("Casa Um");
  expect(r.html).toContain("Fuga de água");
  expect(r.html).not.toContain("Movimento");
  expect(r.html).not.toMatch(/não incluído|requer autorização|de movimento\/porta/i);
  for (const x of ["Casa Dois", "Sala Dois", "Casa de Banho Dois"]) expect(r.html).not.toContain(x);
});

test("casa alheia, casa inexistente, id inválido e dono sem casas: MESMA resposta (/sem-acesso?motivo=relatorio)", async ({ request }) => {
  const respostas = [
    await report(request, "owner", P2),
    await report(request, "owner", INEXISTENTE),
    await report(request, "owner", "abc"),
    await report(request, "owner0", P1),
    await report(request, "tenant", P2)
  ];
  for (const r of respostas) {
    expect(r.status).toBe(307);
    expect(r.location).toMatch(NEGADO);
    expect(r.html).not.toContain("Casa Dois");
  }
  // e a página final é igual para casa alheia e casa inexistente
  const alheia = await reportFinal(request, "owner", P2);
  const inexistente = await reportFinal(request, "owner", INEXISTENTE);
  expect(alheia.status).toBe(200);
  expect(alheia.url).toMatch(NEGADO);
  expect(inexistente.url).toBe(alheia.url);
  expect(inexistente.status).toBe(alheia.status);
  const limpa = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, "");
  expect(limpa(inexistente.html)).toBe(limpa(alheia.html));
  expect(alheia.html).toContain("Relatório indisponível");
  expect(alheia.html).toContain('href="/proprietario"'); // página inicial do dono
});

test("inquilino da Casa Um: vê o relatório da sua casa, filtrado como dono; a casa dos outros não", async ({ request }) => {
  const r = await report(request, "tenant", P1);
  expect(r.status).toBe(200);
  expect(r.html).toContain("Casa Um");
  expect(r.html).toContain("Fuga de água");
  expect(r.html).not.toContain("Movimento"); // mesmo sendo o inquilino, o relatório é o do dono
  const denied = await reportFinal(request, "tenant", P2);
  expect(denied.url).toMatch(NEGADO);
  expect(denied.html).toContain('href="/inquilino"');
});

test("administrador: abre qualquer casa, mas o relatório continua filtrado como o do dono; inexistente = negado", async ({ request }) => {
  for (const id of [P1, P2]) {
    const r = await report(request, "admin", id);
    expect(r.status, id).toBe(200);
    expect(r.html, id).not.toContain("Movimento"); // há eventos de movimento nos dados, mas sem autorização não entram
  }
  expect((await report(request, "admin", INEXISTENTE)).location).toMatch(NEGADO);
  const calls = await log(request);
  expect(calls.some((c) => c.service)).toBe(true); // o administrador lê com o âmbito de administração
});

test("com autorização do inquilino para movimento, o evento aparece — para todos os que podem abrir o relatório", async ({ request }) => {
  await grant(request, P1, "motion");
  for (const who of ["owner", "tenant", "admin"] as const) {
    const r = await report(request, who, P1);
    expect(r.html, who).toContain("Movimento");
    expect(r.html, who).not.toMatch(/rssi|não incluído/i);
  }
  // a autorização da Casa Um não abre nada da Casa Dois
  expect((await report(request, "admin", P2)).html).not.toContain("Movimento");
});

test("dono e inquilino leem com a sua sessão: nunca com a chave de administração nem tabelas base", async ({ request }) => {
  for (const who of ["owner", "tenant", "owner0"] as const) {
    for (const id of [P1, P2, INEXISTENTE]) await report(request, who, id);
  }
  const calls = await log(request);
  expect(calls.filter((c) => c.path.startsWith("/rest/v1/")).length).toBeGreaterThan(5);
  expect(calls.filter((c) => c.service)).toHaveLength(0);
  const tabelas = new Set(calls.map((c) => c.path.replace("/rest/v1/", "")));
  for (const proibida of ["sensor_readings", "satellites", "alerts"]) expect(tabelas.has(proibida), proibida).toBe(false);
  for (const c of calls.filter((x) => x.path === "/rest/v1/rsn_events")) {
    expect(decodeURIComponent(new URLSearchParams(c.query).get("select") ?? "*").replace(/\s/g, "")).toBe("node_id,event,recorded_at");
  }
});

test("se a leitura falhar: mensagem clara, sem dados", async ({ request }) => {
  await request.post(`${FAKE}/__fail`, { data: { on: true } });
  const r = await report(request, "owner", P1);
  expect(r.html).toContain("Não foi possível carregar os dados");
  expect(r.html).not.toContain("falha simulada");
});

// ---------------------------------------------------------------------------
test("estrutura: o relatório pede login, é dinâmico, sem cache e já não usa o âmbito legacy", () => {
  const root = path.resolve(__dirname, "..");
  const page = fs.readFileSync(path.join(root, "app/report/[id]/page.tsx"), "utf8");
  expect(page).toContain("await requireReportReader()");
  expect(page).toContain('export const dynamic = "force-dynamic"');
  expect(page).toContain('export const fetchCache = "force-no-store"');
  expect(page).toContain('filterEventsForViewer(allEvents, "owner", consentGrants)');
  expect(page).not.toMatch(/import\s*\{[^}]*\b(get[A-Z]\w*|hasConsent)\b[^}]*\}\s*from\s*"@\/lib\/data"/); // só o tipo DataReader é permitido
  expect(page).not.toContain("hiddenCount");
  const scope = fs.readFileSync(path.join(root, "lib/report-scope.ts"), "utf8");
  expect(scope).not.toContain("legacyServiceScope");
  expect(scope).toContain('if (!account) redirect("/login")');
});

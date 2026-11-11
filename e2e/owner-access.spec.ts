import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

// PR 4: as páginas do DONO leem os dados com a SESSÃO do próprio dono (nunca
// com a chave de administração) e a base de dados decide o que ele vê. Corre
// contra o site real e o Supabase falso (e2e/fake-supabase.mjs), que imita as
// regras reais: casas por associação, consentimento, vistas, sem tabelas base.

// Nomes dos antigos dados de demonstração (já apagados): nunca podem aparecer.
const NOMES_DE_DEMONSTRACAO = ["Apartamento Rua das Flores", "Moradia Quinta do Sol", "Estúdio Bairro Alto", "Sofia Andrade"];

const FAKE = "http://127.0.0.1:54329";
const P1 = "11111111-1111-4111-8111-111111111111"; // Casa Um (dono)
const P2 = "22222222-2222-4222-8222-222222222222"; // Casa Dois (dono2)

type Who = "admin" | "owner" | "owner2" | "owner0" | "tenant" | "norole";
const USERS: Record<Who, { id: string; email: string; token: string }> = {
  admin: { id: "a0000000-0000-4000-8000-000000000001", email: "admin@teste.invalid", token: "tok-admin" },
  owner: { id: "b0000000-0000-4000-8000-000000000002", email: "dono@teste.invalid", token: "tok-owner" },
  owner2: { id: "70000000-0000-4000-8000-000000000007", email: "dono2@teste.invalid", token: "tok-owner2" },
  owner0: { id: "80000000-0000-4000-8000-000000000008", email: "dono-sem-casas@teste.invalid", token: "tok-owner0" },
  tenant: { id: "c0000000-0000-4000-8000-000000000003", email: "inquilino@teste.invalid", token: "tok-tenant" },
  norole: { id: "d0000000-0000-4000-8000-000000000004", email: "semperfil@teste.invalid", token: "tok-norole" }
};
const COOKIE_NAME = "sb-127-auth-token";
function cookieFor(who: Who): string {
  const u = USERS[who];
  const session = {
    access_token: u.token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `ref-${who}`,
    user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated" }
  };
  return `${COOKIE_NAME}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

type Call = { method: string; path: string; query: string; service: boolean; token: string };
const log = async (r: APIRequestContext): Promise<Call[]> => (await r.get(`${FAKE}/__log`)).json();
const grant = (r: APIRequestContext, property_id: string, category: string) =>
  r.post(`${FAKE}/__consent`, { data: { property_id, category } });

const OWNER_PAGES = [
  "/proprietario",
  "/proprietario/alertas",
  "/proprietario/dispositivos",
  "/proprietario/historico",
  "/proprietario/inquilinos",
  "/proprietario/insights",
  "/proprietario/propriedades",
  `/proprietario/propriedades/${P1}`
];

async function get(r: APIRequestContext, who: Who, url: string) {
  const res = await r.get(url, { headers: { cookie: cookieFor(who) }, maxRedirects: 0 });
  return { status: res.status(), location: res.headers()["location"], html: await res.text() };
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/__reset`);
});

// ---------------------------------------------------------------------------
// a) Sem sessão / papel errado
// ---------------------------------------------------------------------------
test("sem sessão: todas as páginas do dono mandam para /login, sem ler dados nenhuns", async ({ request }) => {
  for (const p of OWNER_PAGES) {
    const res = await request.get(p, { maxRedirects: 0 });
    expect(res.status(), p).toBe(307);
    expect(res.headers()["location"], p).toMatch(/\/login$/);
  }
  expect((await log(request)).filter((c) => c.path.startsWith("/rest/v1/"))).toHaveLength(0);
});

const REDIRECTS: [Who, RegExp][] = [
  ["admin", /\/admin$/],
  ["tenant", /\/inquilino$/],
  ["norole", /\/sem-acesso$/]
];
for (const [who, destino] of REDIRECTS) {
  test(`${who} em /proprietario vai para a sua página, sem ler dados nem usar a chave de administração`, async ({ request }) => {
    for (const p of OWNER_PAGES) {
      const res = await get(request, who, p);
      expect(res.status, p).toBe(307);
      expect(res.location, p).toMatch(destino);
    }
    const calls = await log(request);
    expect(calls.filter((c) => c.service)).toHaveLength(0);
    // só pode ter lido o próprio perfil (para saber o papel)
    expect(calls.filter((c) => c.path.startsWith("/rest/v1/") && c.path !== "/rest/v1/profiles")).toHaveLength(0);
  });
}

// ---------------------------------------------------------------------------
// b) Dono sem casas
// ---------------------------------------------------------------------------
test("dono com 0 casas: ecrã vazio em todas as páginas, sem dados de ninguém nem de demonstração", async ({ request }) => {
  for (const p of OWNER_PAGES) {
    const res = await get(request, "owner0", p);
    expect(res.status, p).toBe(200);
    expect(res.html, p).toContain("Ainda não tem propriedades associadas");
    for (const nome of ["Casa Um", "Casa Dois", "Sala Um", "Sala Dois", "Rua 1", "Rua 2", ...NOMES_DE_DEMONSTRACAO]) {
      expect(res.html, `${p}: ${nome}`).not.toContain(nome);
    }
  }
  expect((await log(request)).filter((c) => c.service)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// c) Dono A não vê nada da casa B
// ---------------------------------------------------------------------------
const DADOS_DA_CASA_DOIS = ["Casa Dois", "Rua 2", "Sala Dois", "Casa de Banho Dois", "AC-HUB-0002", "AC-RSN-0002", "23.5°C", "-52.75", "-40.5", ...NOMES_DE_DEMONSTRACAO];
const DADOS_DA_CASA_UM = ["Casa Um", "Rua 1", "Sala Um", "Casa de Banho Um", "AC-HUB-0001", "AC-RSN-0001", "21.5°C"];

test("dono da Casa Um: vê a sua casa e NADA da Casa Dois, em nenhuma página", async ({ request }) => {
  let viuAsuaCasa = false;
  for (const p of OWNER_PAGES) {
    const res = await get(request, "owner", p);
    expect(res.status, p).toBe(200);
    for (const x of DADOS_DA_CASA_DOIS) expect(res.html, `${p}: ${x}`).not.toContain(x);
    if (res.html.includes("Casa Um")) viuAsuaCasa = true;
  }
  expect(viuAsuaCasa).toBe(true);
  const painel = await get(request, "owner", "/proprietario");
  for (const x of ["Casa Um", "Sala Um", "Casa de Banho Um"]) expect(painel.html).toContain(x);
});

test("mudar o id na URL para a Casa Dois: dá o mesmo «não encontrado» que um id inventado, sem dados", async ({ request }) => {
  const alheia = await get(request, "owner", `/proprietario/propriedades/${P2}`);
  const inventada = await get(request, "owner", "/proprietario/propriedades/99999999-9999-4999-8999-999999999999");
  expect(alheia.status).toBe(404);
  expect(inventada.status).toBe(404);
  for (const x of DADOS_DA_CASA_DOIS) expect(alheia.html, x).not.toContain(x);
  // o histórico com ?property= da casa alheia não a mostra
  const hist = await get(request, "owner", `/proprietario/historico?property=${P2}`);
  for (const x of DADOS_DA_CASA_DOIS) expect(hist.html, x).not.toContain(x);
});

// ---------------------------------------------------------------------------
// d) Sem consentimento: nada de som, movimento, porta nem atividade exata
// ---------------------------------------------------------------------------
const MOVIMENTO_NOS_DADOS = /type\\*"\s*:\s*\\*"motion/;
const SINAL_OU_BATERIA_DE_EVENTOS = /rssi|(?<=[:\s>"])-9[234](?![\w.])|battery\\*"\s*:\s*3[678]/;

test("sem consentimento: o dono não vê som, movimento, atividade exata, nem bateria/sinal dos eventos", async ({ request }) => {
  for (const p of OWNER_PAGES) {
    const res = await get(request, "owner", p);
    expect(res.html, `${p}: som`).not.toContain("-37.25");
    expect(res.html, `${p}: som máx.`).not.toContain("-20.5");
    expect(res.html, `${p}: movimento`).not.toMatch(MOVIMENTO_NOS_DADOS);
    expect(res.html, `${p}: sinal/bateria dos eventos`).not.toMatch(SINAL_OU_BATERIA_DE_EVENTOS);
    expect(res.html, `${p}: bateria exata`).not.toContain("87% bat.");
  }
  const disp = await get(request, "owner", "/proprietario/dispositivos");
  expect(disp.html).toMatch(/~(<!-- -->)?80(<!-- -->)?% bat\./); // arredondada à dezena
  expect(disp.html).toContain("Requer autorização do inquilino");
  // a fuga (não restrita) aparece sempre
  const alertas = await get(request, "owner", "/proprietario/alertas");
  expect(alertas.html).toContain("Fuga de Água Detetada");
});

test("com consentimento da Casa Um: aparece o que foi autorizado — e só para o dono dessa casa", async ({ request }) => {
  await grant(request, P1, "sound");
  await grant(request, P1, "motion");

  const ficha = await get(request, "owner", `/proprietario/propriedades/${P1}`);
  expect(ficha.html).toContain("-37.25");
  expect(ficha.html).toMatch(/87(<!-- -->)?% bat\./);
  const hist = await get(request, "owner", "/proprietario/historico");
  expect(hist.html).toMatch(MOVIMENTO_NOS_DADOS);
  // mesmo com consentimento, a bateria e o sinal dos EVENTOS nunca chegam ao dono
  for (const p of OWNER_PAGES) {
    const res = await get(request, "owner", p);
    expect(res.html, `${p}: sinal/bateria dos eventos`).not.toMatch(SINAL_OU_BATERIA_DE_EVENTOS);
  }
  // a fuga continua ativa mesmo havendo um evento de movimento mais recente
  expect((await get(request, "owner", "/proprietario/alertas")).html).toContain("Fuga de Água Detetada");

  // o dono da Casa Dois não ganha nada com o consentimento da Casa Um
  const outro = await get(request, "owner2", "/proprietario/dispositivos");
  expect(outro.html).not.toContain("-37.25");
  expect(outro.html).not.toContain("-52.75");
  expect(outro.html).not.toMatch(/63(<!-- -->)?% bat\./);
  expect((await get(request, "owner2", "/proprietario/historico")).html).not.toMatch(MOVIMENTO_NOS_DADOS);
});

// ---------------------------------------------------------------------------
// e) Dois utilizadores, seguidos e em paralelo
// ---------------------------------------------------------------------------
test("dois donos, em pedidos seguidos e em paralelo, nunca veem dados um do outro", async ({ request }) => {
  const paginas = ["/proprietario", "/proprietario/dispositivos", "/proprietario/propriedades", "/proprietario/historico"];
  const confere = (who: "owner" | "owner2", html: string, p: string) => {
    const meus = who === "owner" ? ["Casa Um"] : ["Casa Dois"];
    const alheios = who === "owner" ? DADOS_DA_CASA_DOIS : DADOS_DA_CASA_UM;
    for (const x of meus) if (p !== "/proprietario/historico") expect(html, `${who} ${p}: devia ter ${x}`).toContain(x);
    for (const x of alheios) expect(html, `${who} ${p}: não devia ter ${x}`).not.toContain(x);
  };

  // seguidos, alternando
  for (let i = 0; i < 3; i++) {
    for (const p of paginas) {
      const a = await get(request, "owner", p);
      const b = await get(request, "owner2", p);
      confere("owner", a.html, p);
      confere("owner2", b.html, p);
    }
  }
  // em paralelo
  for (let i = 0; i < 4; i++) {
    const pedidos = paginas.flatMap((p) => [
      get(request, "owner", p).then((r) => ({ who: "owner" as const, p, html: r.html })),
      get(request, "owner2", p).then((r) => ({ who: "owner2" as const, p, html: r.html }))
    ]);
    for (const r of await Promise.all(pedidos)) confere(r.who, r.html, r.p);
  }
});

// ---------------------------------------------------------------------------
// f) Sem chave de administração nem tabelas base
// ---------------------------------------------------------------------------
test("nada do que o dono faz usa a chave de administração, as tabelas base ou colunas de bateria/sinal dos eventos", async ({ request }) => {
  for (const who of ["owner", "owner2", "owner0"] as const) {
    for (const p of OWNER_PAGES) await get(request, who, p);
  }
  await get(request, "owner", `/proprietario/propriedades/${P2}`);

  const calls = await log(request);
  const rest = calls.filter((c) => c.path.startsWith("/rest/v1/"));
  expect(rest.length).toBeGreaterThan(20); // o teste está mesmo a ver pedidos
  expect(calls.filter((c) => c.service), "pedidos com a chave de administração").toHaveLength(0);

  const tabelas = new Set(rest.map((c) => c.path.replace("/rest/v1/", "")));
  for (const proibida of ["sensor_readings", "satellites", "alerts"]) {
    expect(tabelas.has(proibida), `o dono leu a tabela base ${proibida}`).toBe(false);
  }
  // lê das vistas
  expect(tabelas.has("sensor_readings_visible")).toBe(true);
  expect(tabelas.has("satellites_visible")).toBe(true);

  const eventos = rest.filter((c) => c.path === "/rest/v1/rsn_events");
  expect(eventos.length).toBeGreaterThan(0);
  for (const c of eventos) {
    const select = decodeURIComponent(new URLSearchParams(c.query).get("select") ?? "*").replace(/\s/g, "");
    expect(select).toBe("node_id,event,recorded_at");
  }
  // só lê (GET)
  expect(rest.filter((c) => c.method !== "GET")).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Erro claro quando a leitura falha
// ---------------------------------------------------------------------------
test("se a leitura falhar: mensagem clara, sem dados de demonstração nem detalhes técnicos", async ({ request }) => {
  await request.post(`${FAKE}/__fail`, { data: { on: true } });
  for (const p of ["/proprietario", "/proprietario/dispositivos", `/proprietario/propriedades/${P1}`]) {
    const res = await get(request, "owner", p);
    expect(res.html, p).toContain("Não foi possível carregar os dados");
    expect(res.html, p).not.toContain("falha simulada");
    for (const nome of NOMES_DE_DEMONSTRACAO) expect(res.html, `${p}: ${nome}`).not.toContain(nome);
    expect(res.html, p).not.toContain("Casa Um");
  }
});

// ---------------------------------------------------------------------------
// Verificações estáticas
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
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const SOURCES = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "components"))];
const text = (file: string) => fs.readFileSync(file, "utf8");

const DATA_FUNCTIONS = [
  "getProperties", "getProperty", "getHub", "getSatellites", "getTenants", "getTenant", "getTenantByProperty",
  "getAlerts", "getInsights", "getHistory", "getSatelliteEvents", "getConsentGrants", "hasConsent", "getOverviewStats", "getFleetHealth"
];

test("estrutura: o modo antigo (chave de administração sem login) e os dados de demonstração já não existem", () => {
  const infratores: string[] = [];
  for (const file of SOURCES) {
    const f = rel(file);
    const source = text(file);
    // nenhuma função de leitura «antiga» exportada por lib/data é importada
    for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(?:@\/lib\/data|\.\/data|\.\.\/lib\/data)"/g)) {
      const nomes = m[1].split(",").map((n) => n.trim().replace(/^type\s+/, ""));
      if (nomes.some((n) => DATA_FUNCTIONS.includes(n))) infratores.push(`${f}: importa funções antigas de lib/data`);
    }
    if (/legacyServiceScope|allowDemoFallback|DEMO_TENANT/.test(source)) infratores.push(`${f}: usa o modo antigo / demonstração`);
    if (/from\s*"(?:@\/lib|\.|\.\.)\/(?:lib\/)?(?:seed|tenant|prng)"/.test(source)) infratores.push(`${f}: importa a demonstração (seed)`);
    if (/from\s*"@\/lib\/supabase"/.test(source) && f !== "app/api/ingest/route.ts") infratores.push(`${f}: importa lib/supabase (cliente de serviço)`);
  }
  expect(infratores).toEqual([]);
  for (const apagado of ["lib/seed.ts", "lib/tenant.ts", "lib/prng.ts"]) {
    expect(fs.existsSync(path.join(ROOT, apagado)), apagado).toBe(false);
  }
});

test("estrutura: o layout e TODAS as páginas do dono chamam requireOwnerScope, sem importar leituras antigas", () => {
  const files = walk(path.join(ROOT, "app/proprietario")).filter((f) => /\/(page|layout)\.tsx$/.test(f.split(path.sep).join("/")));
  expect(files.length).toBeGreaterThanOrEqual(9);
  const sem = files.filter((f) => !text(f).includes("await requireOwnerScope()")).map(rel);
  expect(sem).toEqual([]);
});

test("estrutura: o dono lê com a sessão (vistas), sem cache de dados e sempre dinâmico", () => {
  const layout = text(path.join(ROOT, "app/proprietario/layout.tsx"));
  expect(layout).toContain('export const dynamic = "force-dynamic"');
  expect(layout).toContain('export const fetchCache = "force-no-store"');
  expect(text(path.join(ROOT, "lib/owner/scope.ts"))).toContain("getSessionReader()");
  expect(text(path.join(ROOT, "lib/session-reader.ts"))).toContain("createDataReader(sessionScope())");
  expect(text(path.join(ROOT, "lib/owner/scope.ts"))).not.toContain("legacyServiceScope");
  expect(text(path.join(ROOT, "lib/auth/server-client.ts"))).toContain('cache: "no-store"');
  // as páginas de dono não usam a chave de serviço
  for (const f of walk(path.join(ROOT, "app/proprietario")).concat(walk(path.join(ROOT, "lib/owner")))) {
    expect(text(f), rel(f)).not.toMatch(/service-client|createAdminClient|SUPABASE_SERVICE_ROLE_KEY/);
  }
});

test("estrutura: nenhuma cache de dados do Next em lado nenhum da aplicação", () => {
  const infratores = SOURCES.map(rel).filter((f) => {
    const source = text(path.join(ROOT, f));
    return /unstable_cache|export const revalidate|revalidate\s*:|next:\s*\{\s*revalidate/.test(source);
  });
  expect(infratores).toEqual([]);
});

test("estrutura: /admin lê com o âmbito de administrador, depois de requireAdminPage", () => {
  const files = walk(path.join(ROOT, "app/admin")).filter((f) => /\/(page|layout)\.tsx$/.test(f.split(path.sep).join("/")));
  for (const f of files) {
    const source = text(f);
    expect(source, rel(f)).not.toMatch(/from\s*"@\/lib\/data"/);
    if (/data\.get|reader\.get|DevicesView|PropertyDetailView/.test(source)) {
      expect(source.indexOf("await requireAdminPage()"), rel(f)).toBeLessThan(source.indexOf("await getAdminReader()"));
    }
  }
  expect(text(path.join(ROOT, "lib/admin/data-scope.ts"))).toMatch(/await assertAdmin\(\);\s*return/);
});

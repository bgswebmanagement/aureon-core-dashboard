import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

// PR 5: as páginas do INQUILINO leem os dados com a SESSÃO do próprio
// inquilino (nunca com a chave de administração) e a base de dados decide o
// que ele vê. Corre contra o site real e o Supabase falso, que imita as regras
// reais: casas por associação, consentimento, vistas, sem tabelas base.
//
// Casa Um (P1): inquilino + dono. Casa Dois (P2): inquilino2 + dono2.

const FAKE = "http://127.0.0.1:54329";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const NOMES_DE_DEMONSTRACAO = ["Apartamento Rua das Flores", "Moradia Quinta do Sol", "Estúdio Bairro Alto", "Sofia Andrade", "Vista de demonstração"];

type Who = "admin" | "owner" | "owner2" | "tenant" | "tenant2" | "tenant0" | "norole";
const USERS: Record<Who, { id: string; email: string; token: string }> = {
  admin: { id: "a0000000-0000-4000-8000-000000000001", email: "admin@teste.invalid", token: "tok-admin" },
  owner: { id: "b0000000-0000-4000-8000-000000000002", email: "dono@teste.invalid", token: "tok-owner" },
  owner2: { id: "70000000-0000-4000-8000-000000000007", email: "dono2@teste.invalid", token: "tok-owner2" },
  tenant: { id: "c0000000-0000-4000-8000-000000000003", email: "inquilino@teste.invalid", token: "tok-tenant" },
  tenant2: { id: "90000000-0000-4000-8000-000000000009", email: "inquilino2@teste.invalid", token: "tok-tenant2" },
  tenant0: { id: "10000000-0000-4000-8000-000000000010", email: "inquilino-sem-casa@teste.invalid", token: "tok-tenant0" },
  norole: { id: "d0000000-0000-4000-8000-000000000004", email: "semperfil@teste.invalid", token: "tok-norole" }
};
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
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

type Call = { method: string; path: string; query: string; service: boolean; token: string };
const log = async (r: APIRequestContext): Promise<Call[]> => (await r.get(`${FAKE}/__log`)).json();
const grant = (r: APIRequestContext, property_id: string, category: string) =>
  r.post(`${FAKE}/__consent`, { data: { property_id, category } });

const TENANT_PAGES = [
  "/inquilino",
  "/inquilino/alertas",
  "/inquilino/insights",
  "/inquilino/historico",
  "/inquilino/privacidade"
];

async function get(r: APIRequestContext, who: Who, url: string) {
  const res = await r.get(url, { headers: { cookie: cookieFor(who) }, maxRedirects: 0 });
  return { status: res.status(), location: res.headers()["location"], html: await res.text() };
}

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/__reset`);
});

// Dados que só pertencem a uma das casas (valores distintivos do Supabase falso).
const DADOS_DA_CASA_DOIS = ["Casa Dois", "Rua 2", "Sala Dois", "Casa de Banho Dois", "AC-HUB-0002", "AC-RSN-0002", "23.5°C", "-52.75", "-40.5", ...NOMES_DE_DEMONSTRACAO];
const DADOS_DA_CASA_UM = ["Casa Um", "Rua 1", "Sala Um", "Casa de Banho Um", "Porta Um", "AC-HUB-0001", "AC-RSN-0001", "21.5°C", "-37.25"];

// Tipos de evento nos dados enviados ao browser (a página de histórico leva-os em JSON).
const tipoDeEvento = (tipo: string) => new RegExp(`type\\\\*"\\s*:\\s*\\\\*"${tipo}`);
// Bateria/sinal dos EVENTOS (rsn_events) — nunca chegam a ninguém.
const SINAL_OU_BATERIA_DE_EVENTOS = /rssi|(?<=[:\s>"])-9[1-5](?![\w.])|battery\\*"\s*:\s*3[5-8]/;

// ---------------------------------------------------------------------------
// a) Sem sessão / papel errado
// ---------------------------------------------------------------------------
test("(a) sem sessão: todas as páginas do inquilino mandam para /login, sem ler dados nenhuns", async ({ request }) => {
  for (const p of TENANT_PAGES) {
    const res = await request.get(p, { maxRedirects: 0 });
    expect(res.status(), p).toBe(307);
    expect(res.headers()["location"], p).toMatch(/\/login$/);
  }
  expect((await log(request)).filter((c) => c.path.startsWith("/rest/v1/"))).toHaveLength(0);
});

const REDIRECTS: [Who, RegExp][] = [
  ["admin", /\/admin$/],
  ["owner", /\/proprietario$/],
  ["norole", /\/sem-acesso$/]
];
for (const [who, destino] of REDIRECTS) {
  test(`(a) ${who} em /inquilino vai para a sua página, sem ler dados nem usar a chave de administração`, async ({ request }) => {
    for (const p of TENANT_PAGES) {
      const res = await get(request, who, p);
      expect(res.status, p).toBe(307);
      expect(res.location, p).toMatch(destino);
    }
    const calls = await log(request);
    expect(calls.filter((c) => c.service)).toHaveLength(0);
    expect(calls.filter((c) => c.path.startsWith("/rest/v1/") && c.path !== "/rest/v1/profiles")).toHaveLength(0);
  });
}

// ---------------------------------------------------------------------------
// b) Inquilino sem casa
// ---------------------------------------------------------------------------
test("(b) inquilino com 0 casas: ecrã vazio em todas as páginas, sem dados de ninguém nem de demonstração", async ({ request }) => {
  for (const p of TENANT_PAGES) {
    const res = await get(request, "tenant0", p);
    expect(res.status, p).toBe(200);
    expect(res.html, p).toContain("Ainda não tem uma habitação associada");
    for (const nome of ["Casa Um", "Casa Dois", "Sala Um", "Sala Dois", "Rua 1", "Rua 2", "-37.25", "-52.75", ...NOMES_DE_DEMONSTRACAO]) {
      expect(res.html, `${p}: ${nome}`).not.toContain(nome);
    }
  }
  expect((await log(request)).filter((c) => c.service)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// c) Inquilino da casa A não vê nada da casa B
// ---------------------------------------------------------------------------
test("(c) inquilino da Casa Um: o nome da casa está no topo de todas as páginas e nada da Casa Dois aparece", async ({ request }) => {
  for (const p of TENANT_PAGES) {
    const res = await get(request, "tenant", p);
    expect(res.status, p).toBe(200);
    expect(res.html, `${p}: nome da casa no topo`).toContain('data-testid="casa-do-inquilino"');
    expect(res.html, p).toContain("Casa Um");
    for (const x of DADOS_DA_CASA_DOIS) expect(res.html, `${p}: ${x}`).not.toContain(x);
  }
});

test("(c) o id da Casa Dois no URL (?property=, ?casa=, ?id=) não muda nada: continua a ver só a Casa Um", async ({ request }) => {
  for (const p of TENANT_PAGES) {
    for (const q of ["property", "casa", "id", "propertyId"]) {
      const res = await get(request, "tenant", `${p}?${q}=${P2}`);
      expect(res.status, `${p}?${q}`).toBe(200);
      expect(res.html).toContain("Casa Um");
      for (const x of DADOS_DA_CASA_DOIS) expect(res.html, `${p}?${q}: ${x}`).not.toContain(x);
    }
  }
  // e o relatório da Casa Dois não abre (mesma resposta que um id inventado)
  const alheio = await get(request, "tenant", `/report/${P2}`);
  const inventado = await get(request, "tenant", "/report/99999999-9999-4999-8999-999999999999");
  expect(alheio.status).toBe(307);
  expect(alheio.location).toMatch(/\/sem-acesso\?motivo=relatorio$/);
  expect(inventado.location).toBe(alheio.location);
});

test("(c) com várias casas aparece a primeira por ordem do nome, com a indicação", async ({ request }) => {
  // o inquilino da Casa Um passa a ser também membro da Casa Dois (via chave de administração do FAKE)
  const add = await request.post(`${FAKE}/rest/v1/property_members`, {
    headers: { authorization: "Bearer service-key-falsa", "content-type": "application/json" },
    data: { user_id: USERS.tenant.id, property_id: P2 }
  });
  expect(add.status()).toBe(201);
  const res = await get(request, "tenant", "/inquilino");
  expect(res.html).toContain("Casa Dois"); // «Casa Dois» vem antes de «Casa Um» por ordem do nome
  expect(res.html).toMatch(/A mostrar a 1\.ª de(<!-- -->| )+2(<!-- -->| )+casas/);
  expect(res.html).not.toContain('"Casa Um"'); // só a primeira casa
});

// ---------------------------------------------------------------------------
// d) O inquilino VÊ tudo da sua casa
// ---------------------------------------------------------------------------
test("(d) o inquilino vê o som, o movimento, a porta/janela e a bateria exata da sua casa", async ({ request }) => {
  const painel = await get(request, "tenant", "/inquilino");
  // satélites com bateria EXATA (sem «~») e atividade; hub com o som
  expect(painel.html).toMatch(/87(<!-- -->)?% bat\./);
  expect(painel.html).toMatch(/74(<!-- -->)?% bat\./);
  expect(painel.html).not.toMatch(/~(<!-- -->)?(80|70)(<!-- -->)?% bat\./);
  expect(painel.html).toContain("-37.25");
  expect(painel.html).toContain("Movimento");
  expect(painel.html).toContain("Aberto"); // estado da porta
  expect(painel.html).toContain("Último evento");
  expect(painel.html).not.toContain("Requer autorização do inquilino");
  expect(painel.html).not.toContain("Restrito");

  const historico = await get(request, "tenant", "/inquilino/historico");
  expect(historico.html).toMatch(tipoDeEvento("motion"));
  expect(historico.html).toMatch(tipoDeEvento("doorWindow"));
  expect(historico.html).toMatch(tipoDeEvento("leak"));
  expect(historico.html).toContain("-37.25"); // histórico de ruído
  expect(historico.html).toContain("-20.5");

  // a fuga (antiga) continua a ser um alerta ativo
  expect((await get(request, "tenant", "/inquilino/alertas")).html).toContain("Fuga de Água Detetada");
  // e o inquilino vê os seus nomes: o relatório (como o do dono) mostra o nome do inquilino quando a regra existir
  for (const p of TENANT_PAGES) {
    const res = await get(request, "tenant", p);
    expect(res.html, `${p}: sinal/bateria dos eventos`).not.toMatch(SINAL_OU_BATERIA_DE_EVENTOS);
  }
});

// ---------------------------------------------------------------------------
// e) Dono e inquilino da MESMA casa, no mesmo teste
// ---------------------------------------------------------------------------
test("(e) mesma casa: o dono não vê som/movimento/porta sem consentimento e o inquilino vê tudo; com consentimento o dono vê o autorizado", async ({ request }) => {
  const paginasDono = ["/proprietario", "/proprietario/dispositivos", "/proprietario/historico", `/proprietario/propriedades/${P1}`];
  const verTudoDoInquilino = async () => {
    const t = await get(request, "tenant", "/inquilino");
    expect(t.html).toContain("-37.25");
    expect(t.html).toMatch(/87(<!-- -->)?% bat\./);
    expect(t.html).toContain("Aberto");
    expect(t.html).toContain("Movimento");
  };

  // 1) sem consentimento
  await verTudoDoInquilino();
  for (const p of paginasDono) {
    const d = await get(request, "owner", p);
    expect(d.status, p).toBe(200);
    expect(d.html, `${p}: som`).not.toContain("-37.25");
    expect(d.html, `${p}: movimento nos dados`).not.toMatch(tipoDeEvento("motion"));
    expect(d.html, `${p}: porta nos dados`).not.toMatch(tipoDeEvento("doorWindow"));
    expect(d.html, `${p}: bateria exata`).not.toMatch(/(?<![~\d])(87|74)(<!-- -->)?% bat\./);
    expect(d.html, `${p}: sinal/bateria dos eventos`).not.toMatch(SINAL_OU_BATERIA_DE_EVENTOS);
  }
  const semConsentimento = await get(request, "owner", "/proprietario/dispositivos");
  expect(semConsentimento.html).toMatch(/~(<!-- -->)?80(<!-- -->)?% bat\./);
  expect(semConsentimento.html).toMatch(/~(<!-- -->)?70(<!-- -->)?% bat\./);
  await verTudoDoInquilino(); // o inquilino continua a ver tudo

  // 2) o inquilino autoriza SÓ o movimento: o dono ganha o movimento (e a bateria do satélite de movimento), mas não o som nem a porta
  await grant(request, P1, "motion");
  const aMovimento = await get(request, "owner", "/proprietario/dispositivos");
  expect(aMovimento.html).toMatch(/(?<![~\d])87(<!-- -->)?% bat\./);
  expect(aMovimento.html).toMatch(/~(<!-- -->)?70(<!-- -->)?% bat\./); // a porta continua escondida
  expect((await get(request, "owner", "/proprietario/historico")).html).toMatch(tipoDeEvento("motion"));
  expect((await get(request, "owner", "/proprietario/historico")).html).not.toMatch(tipoDeEvento("doorWindow"));
  expect((await get(request, "owner", `/proprietario/propriedades/${P1}`)).html).not.toContain("-37.25");

  // 3) autoriza também o som e a porta: o dono vê tudo o que foi autorizado — e continua sem sinal/bateria dos eventos
  await grant(request, P1, "sound");
  await grant(request, P1, "doorWindow");
  const tudo = await get(request, "owner", `/proprietario/propriedades/${P1}`);
  expect(tudo.html).toContain("-37.25");
  expect(tudo.html).toMatch(/(?<![~\d])74(<!-- -->)?% bat\./);
  expect((await get(request, "owner", "/proprietario/historico")).html).toMatch(tipoDeEvento("doorWindow"));
  for (const p of paginasDono) {
    expect((await get(request, "owner", p)).html, `${p}: sinal/bateria dos eventos`).not.toMatch(SINAL_OU_BATERIA_DE_EVENTOS);
  }
});

// ---------------------------------------------------------------------------
// f) Dois utilizadores, seguidos e em paralelo
// ---------------------------------------------------------------------------
test("(f) inquilinos e donos de casas diferentes, em pedidos seguidos e em paralelo, nunca veem dados uns dos outros", async ({ request }) => {
  const paginas = ["/inquilino", "/inquilino/historico", "/inquilino/alertas", "/inquilino/privacidade"];
  const confere = (who: "tenant" | "tenant2", html: string, p: string) => {
    const meu = who === "tenant" ? "Casa Um" : "Casa Dois";
    const alheios = who === "tenant" ? DADOS_DA_CASA_DOIS : DADOS_DA_CASA_UM;
    expect(html, `${who} ${p}: devia ter ${meu}`).toContain(meu);
    for (const x of alheios) expect(html, `${who} ${p}: não devia ter ${x}`).not.toContain(x);
  };

  for (let i = 0; i < 3; i++) {
    for (const p of paginas) {
      const a = await get(request, "tenant", p);
      const b = await get(request, "tenant2", p);
      confere("tenant", a.html, p);
      confere("tenant2", b.html, p);
    }
  }
  for (let i = 0; i < 4; i++) {
    const pedidos = paginas.flatMap((p) => [
      get(request, "tenant", p).then((r) => ({ who: "tenant" as const, p, html: r.html })),
      get(request, "tenant2", p).then((r) => ({ who: "tenant2" as const, p, html: r.html })),
      // e um dono a ler ao mesmo tempo: não pode haver mistura entre papéis
      get(request, "owner", "/proprietario/dispositivos").then((r) => ({ who: "owner" as const, p: "/proprietario/dispositivos", html: r.html }))
    ]);
    for (const r of await Promise.all(pedidos)) {
      if (r.who === "owner") {
        expect(r.html).toContain("Casa Um");
        expect(r.html).not.toContain("-37.25"); // o dono nunca herda o que o inquilino vê
        expect(r.html).not.toContain("Casa Dois");
      } else {
        confere(r.who, r.html, r.p);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// g) Sem chave de administração nem tabelas base
// ---------------------------------------------------------------------------
test("(g) nada do que o inquilino faz usa a chave de administração, as tabelas base ou colunas de bateria/sinal dos eventos", async ({ request }) => {
  for (const who of ["tenant", "tenant2", "tenant0"] as const) {
    for (const p of TENANT_PAGES) await get(request, who, p);
  }
  await get(request, "tenant", `/report/${P1}`);
  await get(request, "tenant", `/report/${P2}`);

  const calls = await log(request);
  const rest = calls.filter((c) => c.path.startsWith("/rest/v1/"));
  expect(rest.length).toBeGreaterThan(20); // o teste está mesmo a ver pedidos
  expect(calls.filter((c) => c.service), "pedidos com a chave de administração").toHaveLength(0);

  const tabelas = new Set(rest.map((c) => c.path.replace("/rest/v1/", "")));
  for (const proibida of ["sensor_readings", "satellites", "alerts"]) {
    expect(tabelas.has(proibida), `o inquilino leu a tabela base ${proibida}`).toBe(false);
  }
  expect(tabelas.has("sensor_readings_visible")).toBe(true);
  expect(tabelas.has("satellites_visible")).toBe(true);

  const eventos = rest.filter((c) => c.path === "/rest/v1/rsn_events");
  expect(eventos.length).toBeGreaterThan(0);
  for (const c of eventos) {
    const select = decodeURIComponent(new URLSearchParams(c.query).get("select") ?? "*").replace(/\s/g, "");
    expect(select).toBe("node_id,event,recorded_at");
  }
  // só ler: as páginas do inquilino nunca escrevem (as escritas de consentimentos só vêm da ação)
  expect(rest.filter((c) => c.method !== "GET")).toHaveLength(0);
});

test("se a leitura falhar: mensagem clara, sem dados de demonstração nem detalhes técnicos", async ({ request }) => {
  await request.post(`${FAKE}/__fail`, { data: { on: true } });
  for (const p of TENANT_PAGES) {
    const res = await get(request, "tenant", p);
    expect(res.html, p).toContain("Não foi possível carregar os dados");
    expect(res.html, p).not.toContain("falha simulada");
    for (const nome of [...NOMES_DE_DEMONSTRACAO, "Casa Um", "-37.25"]) expect(res.html, `${p}: ${nome}`).not.toContain(nome);
  }
});

// ---------------------------------------------------------------------------
// Estrutura
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

test("estrutura: o layout e TODAS as páginas do inquilino chamam requireTenantScope; lê com a sessão, sem cache de dados", () => {
  const files = walk(path.join(ROOT, "app/inquilino")).filter((f) => /\/(page|layout)\.tsx$/.test(f.split(path.sep).join("/")));
  expect(files.length).toBeGreaterThanOrEqual(6);
  const sem = files.filter((f) => !text(f).includes("await requireTenantScope()")).map(rel);
  expect(sem).toEqual([]);

  const layout = text(path.join(ROOT, "app/inquilino/layout.tsx"));
  expect(layout).toContain('export const dynamic = "force-dynamic"');
  expect(layout).toContain('export const fetchCache = "force-no-store"');
  expect(layout).toContain("casa-do-inquilino"); // o nome da casa no topo
  expect(text(path.join(ROOT, "lib/tenant/scope.ts"))).toContain("getSessionReader()");

  for (const f of [...walk(path.join(ROOT, "app/inquilino")), ...walk(path.join(ROOT, "lib/tenant"))]) {
    expect(text(f), rel(f)).not.toMatch(/service-client|createAdminClient|SUPABASE_SERVICE_ROLE_KEY|lib\/supabase|unstable_cache|revalidate/);
  }
});

import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// A ação do servidor `setConsent` (app/inquilino/privacidade/actions.ts): o
// inquilino dá e retira autorizações ao dono, a sério. Corre contra o site
// real e o Supabase falso, que imita as regras da base de dados.
//
// As provas de segurança repetem o pedido que o browser faz (mesmo
// identificador da ação) com outros argumentos e outras identidades.

const APP = "http://localhost:3101";
const FAKE = "http://127.0.0.1:54329";
const P1 = "11111111-1111-4111-8111-111111111111"; // Casa Um — inquilino e dono
const P2 = "22222222-2222-4222-8222-222222222222"; // Casa Dois — inquilino2 e dono2

type Who = "admin" | "owner" | "tenant" | "tenant2" | "tenant0" | "norole";
const USERS: Record<Who, { id: string; email: string; token: string }> = {
  admin: { id: "a0000000-0000-4000-8000-000000000001", email: "admin@teste.invalid", token: "tok-admin" },
  owner: { id: "b0000000-0000-4000-8000-000000000002", email: "dono@teste.invalid", token: "tok-owner" },
  tenant: { id: "c0000000-0000-4000-8000-000000000003", email: "inquilino@teste.invalid", token: "tok-tenant" },
  tenant2: { id: "90000000-0000-4000-8000-000000000009", email: "inquilino2@teste.invalid", token: "tok-tenant2" },
  tenant0: { id: "10000000-0000-4000-8000-000000000010", email: "inquilino-sem-casa@teste.invalid", token: "tok-tenant0" },
  norole: { id: "d0000000-0000-4000-8000-000000000004", email: "semperfil@teste.invalid", token: "tok-norole" }
};
function sessionValue(who: Who): string {
  const u = USERS[who];
  const session = {
    access_token: u.token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `ref-${who}`,
    user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated" }
  };
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}
const COOKIE_NAME = "sb-127-auth-token";
const cookieHeader = (who: Who) => `${COOKIE_NAME}=${sessionValue(who)}`;
const addSession = (page: Page, who: Who) =>
  page.context().addCookies([{ name: COOKIE_NAME, value: sessionValue(who), domain: "localhost", path: "/" }]);

type Call = { method: string; path: string; query: string; service: boolean; token: string; body?: any };
type Grant = { id: string; property_id: string; category: string; reason: string | null; active: boolean; expires_at: string | null; created_by: string | null; revoked_by: string | null };
const log = async (r: APIRequestContext): Promise<Call[]> => (await r.get(`${FAKE}/__log`)).json();
const consentWrites = (calls: Call[]) => calls.filter((c) => c.path === "/rest/v1/consent_grants" && c.method !== "GET");
async function grantsInFake(r: APIRequestContext): Promise<Grant[]> {
  // lê-se com a chave de administração do FAKE só para conferir o estado; o registo é limpo a seguir
  const res = await r.get(`${FAKE}/rest/v1/consent_grants`, { headers: { authorization: "Bearer service-key-falsa" } });
  return res.json();
}
const seedGrant = (r: APIRequestContext, property_id: string, category: string, expires_at?: string) =>
  r.post(`${FAKE}/__consent`, { data: { property_id, category, expires_at } });

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/__reset`);
});

// Abre a página de privacidade como `who`, e devolve o pedido da ação capturado ao clicar em «Autorizar».
async function captureAction(page: Page, who: Who) {
  let captured: { headers: Record<string, string> } | null = null;
  page.on("request", (r) => {
    const h = r.headers();
    if (r.method() === "POST" && h["next-action"] && !captured) {
      captured = {
        headers: {
          "next-action": h["next-action"],
          "content-type": h["content-type"] ?? "text/plain;charset=UTF-8",
          accept: h["accept"] ?? "text/x-component",
          ...(h["next-router-state-tree"] ? { "next-router-state-tree": h["next-router-state-tree"] } : {})
        }
      };
    }
  });
  await addSession(page, who);
  await page.goto("/inquilino/privacidade");
  await page.getByRole("button", { name: "Autorizar" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Autorização guardada" })).toBeVisible();
  expect(captured).toBeTruthy();
  return captured!.headers;
}

async function replay(playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } }, headers: Record<string, string>, who: Who | null, args: unknown[]) {
  const ctx = await playwright.request.newContext({ baseURL: APP });
  const res = await ctx.post("/inquilino/privacidade", {
    headers: { ...headers, ...(who ? { cookie: cookieHeader(who) } : {}) },
    data: JSON.stringify(args),
    maxRedirects: 0
  });
  const text = await res.text();
  await ctx.dispose();
  return { status: res.status(), text };
}

// ---------------------------------------------------------------------------
// 1) O inquilino dá e retira, a sério
// ---------------------------------------------------------------------------
test("o inquilino autoriza movimento: grava com a sua sessão, sem prazo, e o dono passa a ver a atividade exata", async ({ page, request }) => {
  await addSession(page, "tenant");
  await page.goto("/inquilino/privacidade");
  await page.getByLabel("Motivo para Movimento").fill("disputa de ruído — teste");
  await page.getByRole("button", { name: "Autorizar" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Autorização guardada" })).toBeVisible();
  await expect(page.getByText("Autorizado desde")).toBeVisible();
  await expect(page.getByText("Motivo: disputa de ruído — teste")).toBeVisible();

  const grants = await grantsInFake(request);
  expect(grants).toHaveLength(1);
  expect(grants[0]).toMatchObject({ property_id: P1, category: "motion", active: true, expires_at: null, reason: "disputa de ruído — teste", created_by: USERS.tenant.id });

  // só com a sessão do inquilino — nunca a chave de administração — e sempre na casa dele
  const writes = consentWrites((await log(request)).filter((c) => !(c.path === "/rest/v1/consent_grants" && c.token === "service-key-falsa" && c.method === "GET")));
  expect(writes.length).toBeGreaterThan(0);
  for (const w of writes) {
    expect(w.service, "escrita com a chave de administração").toBe(false);
    expect(w.token).toBe("tok-tenant");
  }

  // o dono da Casa Um vê agora a atividade exata (bateria 87), o da Casa Dois continua sem ver nada
  const owner = await request.get("/proprietario/dispositivos", { headers: { cookie: cookieHeader("owner") } });
  expect(await owner.text()).toMatch(/87(<!-- -->)?% bat\./);
});

test("o inquilino retira: active=false, quem retirou fica registado, e o dono volta a perder a atividade exata", async ({ page, request }) => {
  await seedGrant(request, P1, "motion");
  await addSession(page, "tenant");
  await page.goto("/inquilino/privacidade");
  await expect(page.getByText("Autorizado desde")).toBeVisible();
  await page.getByRole("button", { name: "Revogar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Autorização retirada" })).toBeVisible();
  await expect(page.getByText("Autorizado desde")).toHaveCount(0);

  const grants = await grantsInFake(request);
  expect(grants[0]).toMatchObject({ active: false, revoked_by: USERS.tenant.id });
  const owner = await request.get("/proprietario/dispositivos", { headers: { cookie: cookieHeader("owner") } });
  expect(await owner.text()).not.toMatch(/87(<!-- -->)?% bat\./);
  expect(await owner.text()).toMatch(/~(<!-- -->)?80(<!-- -->)?% bat\./);
});

test("conceder com uma autorização EXPIRADA ainda ativa: desativa a expirada e cria a nova (sem erro do índice único)", async ({ page, request }) => {
  await seedGrant(request, P1, "motion", "2020-01-01T00:00:00.000Z");
  await addSession(page, "tenant");
  await page.goto("/inquilino/privacidade");
  await page.getByRole("button", { name: "Autorizar" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Autorização guardada" })).toBeVisible();

  const grants = (await grantsInFake(request)).filter((g) => g.category === "motion");
  expect(grants).toHaveLength(2);
  expect(grants.filter((g) => g.active)).toHaveLength(1);
  expect(grants.find((g) => g.active)?.expires_at).toBeNull();
  expect(grants.find((g) => !g.active)?.expires_at).toBe("2020-01-01T00:00:00.000Z");
});

test("conceder quando já há uma ativa (outra pessoa acabou de dar): mensagem clara e continua só uma ativa", async ({ page, request, playwright }) => {
  const headers = await captureAction(page, "tenant"); // 1.ª autorização feita pelo browser
  const again = await replay(playwright, headers, "tenant", ["motion", "grant", ""]);
  expect(again.text).toContain("já está ativa");
  expect((await grantsInFake(request)).filter((g) => g.category === "motion" && g.active)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// 2) Garantias de segurança (o pedido da ação repetido com outros argumentos)
// ---------------------------------------------------------------------------
test("categorias e ações inválidas são recusadas e não escrevem nada", async ({ page, request, playwright }) => {
  const headers = await captureAction(page, "tenant");
  await request.post(`${FAKE}/__reset`);

  const invalidas: unknown[][] = [
    ["camera", "grant", ""],
    ["leak", "grant", ""],
    ["temperature", "grant", ""],
    ["", "grant", ""],
    ["MOTION", "grant", ""],
    ["motion ", "grant", ""],
    ["motion'; drop table consent_grants;--", "grant", ""],
    [["motion"], "grant", ""],
    [{ category: "motion" }, "grant", ""],
    [null, "grant", ""],
    [123, "grant", ""],
    ["__proto__", "grant", ""],
    ["motion", "delete", ""],
    ["motion", "", ""],
    ["motion", null, ""],
    ["motion", ["grant"], ""]
  ];
  for (const args of invalidas) {
    const r = await replay(playwright, headers, "tenant", args);
    expect(r.status, JSON.stringify(args)).toBe(200);
    expect(r.text, JSON.stringify(args)).toMatch(/inválida/);
  }
  // motivo inválido (não texto) e motivo demasiado longo
  expect((await replay(playwright, headers, "tenant", ["motion", "grant", { a: 1 }])).text).toMatch(/Motivo inválido/);
  expect((await replay(playwright, headers, "tenant", ["motion", "grant", "x".repeat(201)])).text).toMatch(/demasiado longo/);

  expect(consentWrites(await log(request)), "nenhuma escrita em consent_grants").toHaveLength(0);
  expect(await grantsInFake(request)).toHaveLength(0);
});

test("a casa vem SEMPRE da sessão: ids de outra casa enviados nos argumentos são ignorados", async ({ page, request, playwright }) => {
  const headers = await captureAction(page, "tenant");
  await request.post(`${FAKE}/__reset`);
  await seedGrant(request, P2, "sound"); // a Casa Dois já autorizou o som ao seu dono

  // o inquilino da Casa Um tenta mexer na Casa Dois: com o id nos argumentos extra, no motivo e até na categoria
  await replay(playwright, headers, "tenant", ["sound", "revoke", "", P2]);
  await replay(playwright, headers, "tenant", ["sound", "revoke", P2, { propertyId: P2, property_id: P2 }]);
  await replay(playwright, headers, "tenant", ["motion", "grant", "", P2]);
  await replay(playwright, headers, "tenant", [P2, "revoke", ""]);

  const grants = await grantsInFake(request);
  const casaDois = grants.filter((g) => g.property_id === P2);
  expect(casaDois).toHaveLength(1);
  expect(casaDois[0]).toMatchObject({ category: "sound", active: true }); // intocada
  expect(casaDois[0].revoked_by ?? null).toBeNull();
  // o que houve foi só na Casa Um
  const calls = consentWrites(await log(request));
  for (const c of calls) {
    const alvo = JSON.stringify([c.body, c.query]);
    expect(alvo, `${c.method} ${c.query}`).not.toContain(P2);
  }
  expect(grants.filter((g) => g.property_id === P1).map((g) => g.category)).toEqual(["motion"]);
});

test("o inquilino da Casa Dois não consegue mexer na Casa Um, e o da Casa Um não na Dois", async ({ page, request, playwright }) => {
  const headers = await captureAction(page, "tenant");
  await request.post(`${FAKE}/__reset`);
  await seedGrant(request, P1, "motion");
  await seedGrant(request, P2, "sound");

  // tenant2 (Casa Dois) tenta retirar «motion»: só tem efeito na casa DELE, que não tem motion → nada acontece na Casa Um
  const r = await replay(playwright, headers, "tenant2", ["motion", "revoke", ""]);
  expect(r.text).toMatch(/já tinha sido retirada/);
  const grants = await grantsInFake(request);
  expect(grants.find((g) => g.property_id === P1)).toMatchObject({ category: "motion", active: true });
  // e retira o som da SUA casa
  await replay(playwright, headers, "tenant2", ["sound", "revoke", ""]);
  expect((await grantsInFake(request)).find((g) => g.property_id === P2)).toMatchObject({ active: false, revoked_by: USERS.tenant2.id });
});

test("quem não é inquilino não consegue conceder nem retirar: dono, administrador, sem perfil, sem casa e sem sessão", async ({ page, request, playwright }) => {
  const headers = await captureAction(page, "tenant");
  await request.post(`${FAKE}/__reset`);
  await seedGrant(request, P1, "sound");

  const quem: { nome: string; who: Who | null }[] = [
    { nome: "dono", who: "owner" },
    { nome: "administrador", who: "admin" },
    { nome: "sem perfil", who: "norole" },
    { nome: "inquilino sem casa", who: "tenant0" },
    { nome: "sem sessão", who: null }
  ];
  for (const q of quem) {
    for (const args of [["motion", "grant", "tentativa"], ["sound", "revoke", ""]]) {
      const r = await replay(playwright, headers, q.who, args);
      expect(r.text, `${q.nome} ${JSON.stringify(args)}`).toContain("Sem permiss");
    }
  }
  expect(consentWrites(await log(request)), "nenhuma escrita").toHaveLength(0);
  const grants = await grantsInFake(request);
  expect(grants).toHaveLength(1);
  expect(grants[0]).toMatchObject({ category: "sound", active: true });
  expect((await log(request)).filter((c) => c.service && c.path !== "/rest/v1/consent_grants")).toHaveLength(0);
});

test("o dono (mesmo da casa) só tem a página dele: não há como conceder consentimentos pela interface do dono", async ({ request }) => {
  const res = await request.get("/inquilino/privacidade", { headers: { cookie: cookieHeader("owner") }, maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toMatch(/\/proprietario$/);
});

test("regras da base de dados (imitadas): pedidos diretos com a sessão do inquilino a outra casa ou a categorias inválidas falham", async ({ request }) => {
  await seedGrant(request, P2, "sound");
  const direto = (method: "POST" | "PATCH", who: Who, data: object, query = "") =>
    request.fetch(`${FAKE}/rest/v1/consent_grants${query}`, {
      method,
      headers: { authorization: `Bearer ${USERS[who].token}`, "content-type": "application/json", prefer: "return=representation" },
      data
    });
  // criar na Casa Dois como inquilino da Casa Um → recusado pela regra de linha
  expect((await direto("POST", "tenant", { property_id: P2, category: "motion" })).status()).toBe(403);
  // categoria inválida na SUA casa → recusada
  expect((await direto("POST", "tenant", { property_id: P1, category: "leak" })).status()).toBe(400);
  // o dono não cria
  expect((await direto("POST", "owner", { property_id: P1, category: "motion" })).status()).toBe(403);
  // retirar na Casa Dois → não vê a linha, não altera nada
  const patch = await direto("PATCH", "tenant", { active: false }, `?property_id=eq.${P2}&category=eq.sound`);
  expect(await patch.json()).toEqual([]);
  // reativar ou alterar outras colunas → recusado
  expect((await direto("PATCH", "tenant2", { active: true }, `?property_id=eq.${P2}`)).status()).toBe(403);
  expect((await direto("PATCH", "tenant2", { reason: "x" }, `?property_id=eq.${P2}`)).status()).toBe(401);
  expect((await grantsInFake(request)).filter((g) => g.active)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// 3) Estrutura
// ---------------------------------------------------------------------------
test("estrutura: a ação só aceita as 3 categorias, verifica o papel, usa a sessão e não usa cache nem chave de administração", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "app/inquilino/privacidade/actions.ts"), "utf8");
  expect(source.startsWith('"use server"')).toBe(true);
  expect(source).toContain('const CATEGORIES = ["motion", "doorWindow", "sound"] as const');
  expect(source).toContain('account.role !== "tenant"');
  expect(source).toContain("createSessionClient()");
  expect(source).toContain("expires_at: null");
  expect(source).not.toMatch(/service-client|createAdminClient|lib\/supabase|SUPABASE_SERVICE_ROLE_KEY/);
  expect(source).not.toMatch(/revalidate|unstable_cache/);
  // uma única função exportada, e nenhum argumento é uma casa
  expect(source.match(/^export async function /gm)).toHaveLength(1);
  expect(source).toContain("export async function setConsent(category: unknown, action: unknown, reason?: unknown)");
  // a casa só vem do servidor
  expect(source).toContain("propertyId = property.id; // a casa vem SEMPRE daqui");
  const client = fs.readFileSync(path.join(root, "components/ConsentManager.tsx"), "utf8");
  expect(client).toContain("router.refresh()");
  expect(client).not.toMatch(/propertyId|isLiveMode|useState\(initialGrants\)/);
});

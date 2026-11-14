import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

// Login do ADMINISTRADOR com email + palavra-passe (POST /auth/palavra-passe).
// Corre contra o site real e o Supabase falso (e2e/fake-supabase.mjs), que gera
// palavras-passe de teste ao acaso em cada corrida: nenhuma está escrita aqui.

const FAKE = "http://127.0.0.1:54329";
const MENSAGEM = "Email ou palavra-passe incorretos.";
const COOKIE_NAME = "sb-127-auth-token";
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };

type Credencial = { email: string; password: string };
type Credenciais = Record<"admin" | "owner" | "tenant" | "norole" | "banned", Credencial>;
type Call = { method: string; path: string; query: string; service: boolean; body?: any };

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/__reset`);
});

async function credenciais(request: APIRequestContext): Promise<Credenciais> {
  return (await request.get(`${FAKE}/__credentials`)).json();
}
async function fakeLog(request: APIRequestContext): Promise<Call[]> {
  return (await request.get(`${FAKE}/__log`)).json();
}
function entrar(request: APIRequestContext, email: string, password: string, headers: Record<string, string> = SAME_ORIGIN) {
  return request.post("/auth/palavra-passe", { form: { email, password }, headers, maxRedirects: 0 });
}
const setCookies = (res: APIResponse) => res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
const temSessao = (res: APIResponse) => setCookies(res).some((c) => c.startsWith(COOKIE_NAME));

// Os casos que TÊM de falhar, todos com a mesma resposta.
function casosDeFalha(c: Credenciais): { nome: string; email: string; password: string }[] {
  return [
    { nome: "palavra-passe errada (administrador)", email: c.admin.email, password: randomUUID() },
    { nome: "email que não existe", email: "ninguem@teste.invalid", password: randomUUID() },
    { nome: "conta de dono com a palavra-passe certa", email: c.owner.email, password: c.owner.password },
    { nome: "conta de inquilino com a palavra-passe certa", email: c.tenant.email, password: c.tenant.password },
    { nome: "conta sem perfil com a palavra-passe certa", email: c.norole.email, password: c.norole.password },
    { nome: "administrador desativado com a palavra-passe certa", email: c.banned.email, password: c.banned.password },
    { nome: "palavra-passe vazia", email: c.admin.email, password: "" },
    { nome: "campos vazios", email: "", password: "" }
  ];
}

// ---------------------------------------------------------------------------
// 1) Pedidos diretos: todas as falhas são iguais
// ---------------------------------------------------------------------------
test("todas as falhas dão a MESMA resposta, sem cookies e sem dados na URL", async ({ request }) => {
  const c = await credenciais(request);
  const respostas: { nome: string; location: string }[] = [];

  for (const caso of casosDeFalha(c)) {
    const res = await entrar(request, caso.email, caso.password);
    expect(res.status(), caso.nome).toBe(303);
    const location = res.headers()["location"];
    expect(location, caso.nome).toMatch(/\/login\?erro=senha$/);
    expect(location, caso.nome).not.toContain(caso.password || "\u0000");
    expect(location, caso.nome).not.toContain(encodeURIComponent(caso.email) || "\u0000");
    expect(temSessao(res), `${caso.nome}: não pode enviar cookie de sessão`).toBe(false);
    expect(res.headers()["cache-control"], caso.nome).toBe("no-store");
    respostas.push({ nome: caso.nome, location });
  }

  // exatamente a mesma resposta em todos os casos
  expect(new Set(respostas.map((r) => r.location)).size).toBe(1);
});

test("conta de dono com a palavra-passe certa: é rejeitada e a sessão aberta no Supabase é fechada", async ({ request }) => {
  const c = await credenciais(request);
  const res = await entrar(request, c.owner.email, c.owner.password);
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toMatch(/\/login\?erro=senha$/);
  expect(temSessao(res)).toBe(false);

  const log = await fakeLog(request);
  expect(log.some((x) => x.path === "/auth/v1/token"), "tentou entrar").toBe(true);
  expect(log.some((x) => x.path === "/auth/v1/logout"), "fechou a sessão acabada de abrir").toBe(true);
  expect(log.some((x) => x.service), "nunca usa a chave de administração").toBe(false);
});

test("email que não existe: não fecha sessão nenhuma e não revela nada", async ({ request }) => {
  const res = await entrar(request, "ninguem@teste.invalid", randomUUID());
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toMatch(/\/login\?erro=senha$/);
  const log = await fakeLog(request);
  expect(log.filter((x) => x.path === "/auth/v1/logout")).toHaveLength(0);
});

test("a palavra-passe nunca aparece nos registos do Supabase falso nem em URLs", async ({ request }) => {
  const c = await credenciais(request);
  await entrar(request, c.admin.email, c.admin.password);
  await entrar(request, c.admin.email, randomUUID());
  const log = await fakeLog(request);
  const texto = JSON.stringify(log);
  for (const pass of [c.admin.password, c.owner.password]) {
    expect(texto).not.toContain(pass);
    // (o endereço do Supabase leva «grant_type=password», que é o nome do método, não a palavra-passe)
    expect(log.every((x) => !x.query.includes(pass))).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// 2) Sucesso e proteção contra outros sites
// ---------------------------------------------------------------------------
test("administrador com a palavra-passe certa: vai para /admin com sessão (cookie httpOnly), mas /admin ainda pede o código de 6 dígitos", async ({ request }) => {
  const c = await credenciais(request);
  const res = await entrar(request, c.admin.email, c.admin.password);
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toMatch(/\/admin$/);
  expect(res.headers()["location"]).not.toContain(c.admin.password);

  const cookies = setCookies(res).filter((v) => v.startsWith(COOKIE_NAME));
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) expect(cookie.toLowerCase()).toContain("httponly");

  const cookieHeader = cookies.map((v) => v.split(";")[0]).join("; ");
  // a sessão só tem a palavra-passe (aal1): /admin manda pedir o código
  const admin = await request.get("/admin", { headers: { cookie: cookieHeader }, maxRedirects: 0 });
  expect(admin.status()).toBe(307);
  expect(admin.headers()["location"]).toMatch(/\/auth\/mfa$/);
});

test("sem sessão, /admin continua a ir para /login", async ({ request }) => {
  const res = await request.get("/admin", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toMatch(/\/login$/);
});

const CROSS_SITE: { nome: string; headers: Record<string, string> }[] = [
  { nome: "Sec-Fetch-Site: cross-site", headers: { "sec-fetch-site": "cross-site" } },
  { nome: "Sec-Fetch-Site: same-site", headers: { "sec-fetch-site": "same-site" } },
  { nome: "outro site (Origin), sem Sec-Fetch-Site", headers: { origin: "https://evil.example" } },
  { nome: "Origin: null sem Sec-Fetch-Site", headers: { origin: "null" } }
];
for (const caso of CROSS_SITE) {
  test(`POST de outro site é recusado (403) mesmo com credenciais certas — ${caso.nome}`, async ({ request }) => {
    const c = await credenciais(request);
    const res = await entrar(request, c.admin.email, c.admin.password, caso.headers);
    expect(res.status()).toBe(403);
    expect(temSessao(res)).toBe(false);
    // nem sequer chega a tentar entrar no Supabase
    expect((await fakeLog(request)).some((x) => x.path === "/auth/v1/token")).toBe(false);
  });
}

test("formulário de um browser real (Origin: null com Sec-Fetch-Site: same-origin) é aceite", async ({ request }) => {
  const c = await credenciais(request);
  const res = await entrar(request, c.admin.email, c.admin.password, { origin: "null", "sec-fetch-site": "same-origin" });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toMatch(/\/admin$/);
});

test("GET /auth/palavra-passe não existe (só POST)", async ({ request }) => {
  const res = await request.get("/auth/palavra-passe", { maxRedirects: 0 });
  expect(res.status()).toBe(405);
});

// ---------------------------------------------------------------------------
// 3) Browser a sério: o formulário, a mensagem igual em todos os casos e o sucesso
// ---------------------------------------------------------------------------
test("browser: o formulário é só POST, com os atributos certos, e o link por email continua lá", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Enviar link de acesso" })).toBeVisible(); // formulário atual mantém-se
  await page.getByText("Administrador", { exact: true }).click();

  const form = page.locator("#admin-login-tab form");
  await expect(form).toHaveAttribute("method", "post");
  await expect(form).toHaveAttribute("action", "/auth/palavra-passe");
  await expect(form.locator('input[name="email"]')).toHaveAttribute("type", "email");
  await expect(form.locator('input[name="password"]')).toHaveAttribute("type", "password");
  await expect(form.locator('input[name="password"]')).toHaveAttribute("autocomplete", "current-password");
});

test("browser: todas as falhas mostram exatamente a mesma mensagem e nada na URL; o sucesso vai para /admin", async ({ page, request }) => {
  const c = await credenciais(request);
  const mensagens: string[] = [];

  for (const caso of casosDeFalha(c).filter((x) => x.email && x.password)) {
    await page.goto("/login");
    await page.getByText("Administrador", { exact: true }).click();
    await page.locator("#admin-email").fill(caso.email);
    await page.locator("#admin-password").fill(caso.password);
    await page.locator("#admin-login-tab").getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL(/\/login\?erro=senha$/);
    const alerta = page.locator("#admin-login-tab").getByRole("alert");
    await expect(alerta, caso.nome).toBeVisible();
    mensagens.push((await alerta.innerText()).trim());
    expect(page.url(), caso.nome).not.toContain(caso.password);
    expect(page.url(), caso.nome).not.toContain(encodeURIComponent(caso.email));
  }

  expect(mensagens.length).toBeGreaterThanOrEqual(6);
  expect(new Set(mensagens)).toEqual(new Set([MENSAGEM]));

  // sucesso do administrador, no browser
  await page.goto("/login");
  await page.getByText("Administrador", { exact: true }).click();
  await page.locator("#admin-email").fill(c.admin.email);
  await page.locator("#admin-password").fill(c.admin.password);
  await page.locator("#admin-login-tab").getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/auth\/mfa$/); // palavra-passe certa: falta o código de 6 dígitos
  expect(page.url()).not.toContain(c.admin.password);
});

// ---------------------------------------------------------------------------
// 4) Verificações estáticas
// ---------------------------------------------------------------------------
test("estrutura: a rota nunca regista a palavra-passe nem usa a chave de administração", () => {
  const file = path.resolve(__dirname, "../app/auth/palavra-passe/route.ts");
  const source = fs.readFileSync(file, "utf8");
  const logLines = source.split("\n").filter((line) => /console\./.test(line));
  expect(logLines, "a rota não deve registar nada sobre o pedido").toEqual([]);
  expect(source).not.toContain("service-client");
  expect(source).toContain("isSameOrigin(request)");
  expect(source).toContain('profile?.role !== "admin"');
});

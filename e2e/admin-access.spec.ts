import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Provas de que /admin e as ações de /admin/utilizadores só funcionam para
// administradores, e de que o convite grava o que deve. Corre contra o site
// real e um Supabase falso (e2e/fake-supabase.mjs) que regista todos os pedidos;
// "chamadas de serviço" = pedidos feitos com a CHAVE DE ADMINISTRAÇÃO.

const APP = "http://localhost:3101";
const FAKE = "http://127.0.0.1:54329";
const P1 = "11111111-1111-4111-8111-111111111111"; // Casa Um
const P2 = "22222222-2222-4222-8222-222222222222"; // Casa Dois

type Role = "admin" | "owner" | "tenant" | "norole";
const USERS: Record<Role, { id: string; email: string }> = {
  admin: { id: "a0000000-0000-4000-8000-000000000001", email: "admin@teste.invalid" },
  owner: { id: "b0000000-0000-4000-8000-000000000002", email: "dono@teste.invalid" },
  tenant: { id: "c0000000-0000-4000-8000-000000000003", email: "inquilino@teste.invalid" },
  norole: { id: "d0000000-0000-4000-8000-000000000004", email: "semperfil@teste.invalid" }
};
const HOME: Record<Exclude<Role, "admin">, string> = { owner: "/proprietario", tenant: "/inquilino", norole: "/sem-acesso" };

const ADMIN_PATHS = [
  "/admin",
  "/admin/alertas",
  "/admin/consentimentos",
  "/admin/dispositivos",
  "/admin/propriedades",
  "/admin/propriedades/qualquer-id",
  "/admin/utilizadores"
];

type Call = { method: string; path: string; query: string; service: boolean; token: string; body?: any };

// Cookie de sessão tal como o @supabase/ssr o escreve (nome derivado do endereço do falso Supabase).
function sessionValue(role: Role): string {
  const session = {
    access_token: `tok-${role}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `ref-${role}`,
    user: { id: USERS[role].id, email: USERS[role].email, aud: "authenticated", role: "authenticated" }
  };
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}
const COOKIE_NAME = "sb-127-auth-token";
const cookieHeader = (role: Role) => `${COOKIE_NAME}=${sessionValue(role)}`;
const addSession = (page: Page, role: Role) =>
  page.context().addCookies([{ name: COOKIE_NAME, value: sessionValue(role), domain: "localhost", path: "/" }]);

async function resetFake(request: APIRequestContext) {
  await request.post(`${FAKE}/__reset`);
}
async function fakeLog(request: APIRequestContext): Promise<Call[]> {
  return (await request.get(`${FAKE}/__log`)).json();
}
const serviceCalls = (log: Call[]) => log.filter((call) => call.service);

test.beforeEach(async ({ request }) => {
  await resetFake(request);
});

// ---------------------------------------------------------------------------
// 1) Páginas de /admin
// ---------------------------------------------------------------------------
test("sem sessão: todas as páginas de /admin mandam para /login e nunca usam a chave de administração", async ({ request }) => {
  for (const p of ADMIN_PATHS) {
    const res = await request.get(p, { maxRedirects: 0 });
    expect(res.status(), p).toBe(307);
    expect(res.headers()["location"], p).toMatch(/\/login$/);
  }
  expect(serviceCalls(await fakeLog(request))).toHaveLength(0);
});

for (const role of ["owner", "tenant", "norole"] as const) {
  test(`${role}: as páginas de /admin mandam para ${HOME[role]} e nunca usam a chave de administração`, async ({ request }) => {
    for (const p of ADMIN_PATHS) {
      const res = await request.get(p, { maxRedirects: 0, headers: { cookie: cookieHeader(role) } });
      expect(res.status(), p).toBe(307);
      expect(res.headers()["location"], p).toMatch(new RegExp(`${HOME[role]}$`));
    }
    expect(serviceCalls(await fakeLog(request))).toHaveLength(0);
  });
}

test("administrador: /admin e /admin/utilizadores abrem e mostram as contas", async ({ request }) => {
  const overview = await request.get("/admin", { maxRedirects: 0, headers: { cookie: cookieHeader("admin") } });
  expect(overview.status()).toBe(200);

  const users = await request.get("/admin/utilizadores", { maxRedirects: 0, headers: { cookie: cookieHeader("admin") } });
  expect(users.status()).toBe(200);
  const html = await users.text();
  expect(html).toContain("Convidar utilizador");
  for (const email of ["dono@teste.invalid", "inquilino@teste.invalid", "pendente@teste.invalid"]) expect(html).toContain(email);
});

// ---------------------------------------------------------------------------
// 2) Convites pela interface (browser a sério, como administrador)
// ---------------------------------------------------------------------------
test("administrador convida um proprietário: conta, perfil e casas gravados", async ({ page, request }) => {
  await addSession(page, "admin");
  await page.goto("/admin/utilizadores");
  await page.locator("#invite-email").fill("Novo.Dono@Teste.Invalid");
  await page.getByLabel(/Casa Um/).check();
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Convite enviado para novo.dono@teste.invalid" })).toBeVisible();

  const log = await fakeLog(request);
  const invite = log.find((c) => c.path === "/auth/v1/invite");
  expect(invite?.service).toBe(true);
  expect(invite?.body.email).toBe("novo.dono@teste.invalid");
  expect(decodeURIComponent(invite?.query ?? "")).toContain("redirect_to=http://localhost:3101/auth/confirm");

  const profile = log.find((c) => c.method === "POST" && c.path === "/rest/v1/profiles");
  expect(profile?.body).toMatchObject({ role: "owner" });
  const members = log.find((c) => c.method === "POST" && c.path === "/rest/v1/property_members");
  expect(members?.body).toEqual([{ user_id: profile?.body.id, property_id: P1 }]);
  expect(log.some((c) => c.method === "POST" && c.path === "/rest/v1/tenants")).toBe(false);
});

test("administrador convida um inquilino: também grava tenants.user_id", async ({ page, request }) => {
  await addSession(page, "admin");
  await page.goto("/admin/utilizadores");
  await page.locator("#invite-email").fill("maria@teste.invalid");
  await page.getByLabel("Inquilino", { exact: true }).check();
  await page.locator("#invite-name").fill("Maria Silva");
  await page.getByLabel(/Casa Dois/).check();
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Convite enviado para maria@teste.invalid" })).toBeVisible();

  const log = await fakeLog(request);
  const profile = log.find((c) => c.method === "POST" && c.path === "/rest/v1/profiles");
  expect(profile?.body).toMatchObject({ role: "tenant" });
  const tenant = log.find((c) => c.method === "POST" && c.path === "/rest/v1/tenants");
  expect(tenant?.body).toMatchObject({ property_id: P2, user_id: profile?.body.id, name: "Maria Silva", email: "maria@teste.invalid" });
});

test("se gravar o perfil falhar, o convite é desfeito (a conta criada é apagada)", async ({ page, request }) => {
  await addSession(page, "admin");
  await page.goto("/admin/utilizadores");
  await page.locator("#invite-email").fill("falha-perfil@teste.invalid");
  await page.getByLabel(/Casa Um/).check();
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Não foi possível gravar o convite" })).toBeVisible();

  const log = await fakeLog(request);
  const invite = log.find((c) => c.path === "/auth/v1/invite");
  expect(invite).toBeTruthy();
  const removed = log.find((c) => c.method === "DELETE" && c.path.startsWith("/auth/v1/admin/users/"));
  expect(removed, "a conta criada tem de ser apagada").toBeTruthy();
});

test("convidar um email que já tem conta dá uma mensagem útil e não grava nada", async ({ page, request }) => {
  await addSession(page, "admin");
  await page.goto("/admin/utilizadores");
  await page.locator("#invite-email").fill("dono@teste.invalid");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByRole("status").filter({ hasText: "já tem conta" })).toBeVisible();
  const log = await fakeLog(request);
  expect(log.some((c) => c.method === "POST" && c.path === "/rest/v1/profiles")).toBe(false);
});

// ---------------------------------------------------------------------------
// 3) As quatro ações, repetidas por quem NÃO é administrador
// ---------------------------------------------------------------------------
test("ações do servidor: o administrador consegue; repetidas por dono, inquilino, sem perfil e sem sessão são recusadas sem usar a chave", async ({
  page,
  request,
  playwright
}) => {
  type Captured = { name: string; headers: Record<string, string>; body: Buffer | null };
  const captured: Captured[] = [];
  let currentName = "";
  page.on("request", (r) => {
    const h = r.headers();
    if (r.method() === "POST" && h["next-action"]) {
      captured.push({
        name: currentName,
        headers: {
          "next-action": h["next-action"],
          "content-type": h["content-type"] ?? "text/plain;charset=UTF-8",
          accept: h["accept"] ?? "text/x-component",
          ...(h["next-router-state-tree"] ? { "next-router-state-tree": h["next-router-state-tree"] } : {})
        },
        body: r.postDataBuffer()
      });
    }
  });

  await addSession(page, "admin");
  await page.goto("/admin/utilizadores");

  // inviteUser
  currentName = "inviteUser";
  await page.locator("#invite-email").fill("outro@teste.invalid");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Convite enviado" })).toBeVisible();

  // resendLink (conta com convite por aceitar)
  currentName = "resendLink";
  await page.getByRole("row", { name: /pendente@teste\.invalid/ }).getByRole("button", { name: "Reenviar link" }).click();
  await expect(page.getByText("Link enviado para pendente@teste.invalid")).toBeVisible();

  // setUserProperties
  currentName = "setUserProperties";
  const ownerRow = page.getByRole("row", { name: /^dono@teste\.invalid/ });
  await ownerRow.getByRole("button", { name: "Casas" }).click();
  await ownerRow.getByLabel("Casa Dois").check();
  await ownerRow.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Casas atualizadas.")).toBeVisible();

  // setUserActive
  currentName = "setUserActive";
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("row", { name: /inquilino@teste\.invalid/ }).getByRole("button", { name: "Desativar" }).click();
  await expect(page.getByText(/Conta de inquilino@teste\.invalid desativada/)).toBeVisible();

  const names = Array.from(new Set(captured.map((c) => c.name))).sort();
  expect(names).toEqual(["inviteUser", "resendLink", "setUserActive", "setUserProperties"]);

  // O administrador conseguiu: houve chamadas de serviço. Agora limpa-se o registo
  // e repete-se cada pedido com outras identidades.
  expect(serviceCalls(await fakeLog(request)).length).toBeGreaterThan(0);

  const callers: { nome: string; cookie?: string }[] = [
    { nome: "dono", cookie: cookieHeader("owner") },
    { nome: "inquilino", cookie: cookieHeader("tenant") },
    { nome: "sem perfil", cookie: cookieHeader("norole") },
    { nome: "sem sessão" }
  ];

  for (const action of captured) {
    for (const caller of callers) {
      await resetFake(request);
      const ctx = await playwright.request.newContext({ baseURL: APP });
      const res = await ctx.post("/admin/utilizadores", {
        headers: { ...action.headers, ...(caller.cookie ? { cookie: caller.cookie } : {}) },
        data: action.body ?? undefined,
        maxRedirects: 0
      });
      const text = await res.text();
      await ctx.dispose();

      const label = `${action.name} repetida por ${caller.nome}`;
      const redirect = res.headers()["x-action-redirect"] ?? res.headers()["location"];
      console.log(
        `      ${label}: HTTP ${res.status()}${redirect ? ` → ${redirect}` : ""}${text.includes("Sem permiss") ? " «Sem permissão»" : ""}`
      );
      // A própria ação responde «Sem permissão» (HTTP 200) e não faz mais nada.
      expect(res.status(), label).toBe(200);
      expect(text, label).toContain("Sem permiss");
      expect(serviceCalls(await fakeLog(request)), `${label} usou a chave de administração`).toHaveLength(0);
    }
  }
});

// ---------------------------------------------------------------------------
// 4) type=invite (o modelo de email «Invite user» usa-o) em /auth/confirm e /auth/entrar
// ---------------------------------------------------------------------------
test("/auth/confirm aceita type=invite e mostra o botão Entrar", async ({ request }) => {
  const res = await request.get("/auth/confirm?token_hash=valid-owner-123456&type=invite", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('name="type" value="invite"');
  expect(html).toContain("Entrar");
  expect((await fakeLog(request)).some((c) => c.path === "/auth/v1/verify")).toBe(false); // abrir a página não gasta o código
});

const INVITE_CASES: { token: string; destino: RegExp }[] = [
  { token: "valid-owner-123456", destino: /\/proprietario$/ },
  { token: "valid-tenant-123456", destino: /\/inquilino$/ },
  { token: "valid-admin-123456", destino: /\/admin$/ },
  { token: "valid-norole-123456", destino: /\/sem-acesso$/ },
  { token: "invalido-1234567890", destino: /\/login\?erro=link$/ }
];
for (const caso of INVITE_CASES) {
  test(`/auth/entrar com type=invite e ${caso.token}: vai para ${caso.destino.source}`, async ({ request }) => {
    const res = await request.post("/auth/entrar", {
      form: { token_hash: caso.token, type: "invite" },
      headers: { "sec-fetch-site": "same-origin", origin: "null" },
      maxRedirects: 0
    });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toMatch(caso.destino);
    const verify = (await fakeLog(request)).find((c) => c.path === "/auth/v1/verify");
    expect(verify?.body.type).toBe("invite");
    if (!caso.token.startsWith("invalido")) {
      expect(res.headersArray().some((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith(COOKIE_NAME))).toBe(true);
    }
  });
}

test("/auth/confirm e /auth/entrar continuam a recusar tipos não permitidos (recovery)", async ({ request }) => {
  const page = await request.get("/auth/confirm?token_hash=valid-owner-123456&type=recovery", { maxRedirects: 0 });
  expect(page.status()).toBe(307);
  expect(page.headers()["location"]).toMatch(/\/login\?erro=link$/);

  const post = await request.post("/auth/entrar", {
    form: { token_hash: "valid-owner-123456", type: "recovery" },
    headers: { "sec-fetch-site": "same-origin" },
    maxRedirects: 0
  });
  expect(post.status()).toBe(303);
  expect(post.headers()["location"]).toMatch(/\/login\?erro=link$/);
  expect((await fakeLog(request)).some((c) => c.path === "/auth/v1/verify")).toBe(false);
});

// ---------------------------------------------------------------------------
// 5) Verificações estáticas (a estrutura que garante as provas acima)
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

test("estrutura: o cliente de administração só é importado por lib/admin e app/admin", () => {
  const offenders = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "components")), path.join(ROOT, "middleware.ts")]
    .filter((file) => fs.readFileSync(file, "utf8").includes("admin/service-client"))
    .map(rel)
    .filter((file) => !file.startsWith("lib/admin/") && !file.startsWith("app/admin/"));
  expect(offenders).toEqual([]);
});

test("estrutura: toda a ação do servidor de /admin/utilizadores começa por withAdmin", () => {
  const source = fs.readFileSync(path.join(ROOT, "app/admin/utilizadores/actions.ts"), "utf8");
  expect(source.startsWith('"use server"')).toBe(true);
  const parts = source.split(/^export async function /m).slice(1);
  const names = parts.map((part) => part.slice(0, part.indexOf("(")));
  expect(names.sort()).toEqual(["inviteUser", "resendLink", "setUserActive", "setUserProperties"]);
  for (const part of parts) {
    const body = part.slice(part.indexOf("{") + 1).trimStart();
    expect(body.startsWith("return withAdmin("), `${part.slice(0, 20)}… tem de começar por return withAdmin(`).toBe(true);
  }
});

test("estrutura: o layout e todas as páginas de /admin chamam requireAdminPage", () => {
  const files = walk(path.join(ROOT, "app/admin")).filter((file) => /\/(page|layout)\.tsx$/.test(file.split(path.sep).join("/")));
  expect(files.length).toBeGreaterThanOrEqual(8);
  const missing = files.filter((file) => !fs.readFileSync(file, "utf8").includes("await requireAdminPage()")).map(rel);
  expect(missing).toEqual([]);
});

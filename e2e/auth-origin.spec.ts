import { expect, test } from "@playwright/test";

const PORT = 3101;
const OWN_ORIGIN = `http://localhost:${PORT}`;
const TOKEN = "abcdef1234567890"; // código falso: a verificação do código falha sempre

// ---------------------------------------------------------------------------
// 1) Browser a sério: clicar em "Entrar" em /auth/confirm.
//    A página usa referrer "no-referrer" (protege o código do link); com essa
//    política o browser envia "Origin: null" nos POST de formulários. O pedido
//    tem de chegar na mesma (Sec-Fetch-Site: same-origin).
// ---------------------------------------------------------------------------
test("browser: clicar em Entrar em /auth/confirm — o POST chega e não é recusado", async ({ page }) => {
  await page.goto(`/auth/confirm?token_hash=${TOKEN}&type=email`);

  // a proteção do código do link tem de se manter
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

  const postRequest = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/auth/entrar"));
  await page.getByRole("button", { name: "Entrar" }).click();
  const request = await postRequest;

  const headers = await request.allHeaders();
  console.log(`      cabeçalhos enviados pelo browser: origin=${headers["origin"]}  sec-fetch-site=${headers["sec-fetch-site"]}`);
  expect(headers["sec-fetch-site"]).toBe("same-origin");

  // O código é falso, por isso o fim é "link inválido" — mas só se chegar lá
  // quem passou a verificação de origem. Recusado seria "Pedido recusado." (403).
  await page.waitForURL(/\/login\?erro=link/);
  await expect(page.getByText("Este link expirou ou já foi usado")).toBeVisible();
  await expect(page.getByText("Pedido recusado")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 2) Pedidos manuais (sem browser), em /auth/entrar e /auth/sair.
//    303 = passou a verificação de origem; 403 = recusado.
// ---------------------------------------------------------------------------
type Caso = { nome: string; headers: Record<string, string>; esperado: 303 | 403 };

const CASOS: Caso[] = [
  { nome: "sem Origin nem Sec-Fetch-Site (ex.: curl)", headers: {}, esperado: 303 },
  { nome: "Origin do próprio site, sem Sec-Fetch-Site", headers: { origin: OWN_ORIGIN }, esperado: 303 },
  { nome: "Sec-Fetch-Site: same-origin, sem Origin", headers: { "sec-fetch-site": "same-origin" }, esperado: 303 },
  { nome: "Sec-Fetch-Site: none", headers: { "sec-fetch-site": "none" }, esperado: 303 },
  {
    nome: "Origin: null COM Sec-Fetch-Site: same-origin (browser real com no-referrer)",
    headers: { origin: "null", "sec-fetch-site": "same-origin" },
    esperado: 303
  },
  { nome: "Origin: null SEM Sec-Fetch-Site", headers: { origin: "null" }, esperado: 403 },
  {
    nome: "Origin: null com Sec-Fetch-Site: cross-site",
    headers: { origin: "null", "sec-fetch-site": "cross-site" },
    esperado: 403
  },
  {
    nome: "Origin: null com Sec-Fetch-Site: same-site",
    headers: { origin: "null", "sec-fetch-site": "same-site" },
    esperado: 403
  },
  { nome: "outro site, sem Sec-Fetch-Site", headers: { origin: "https://evil.example" }, esperado: 403 },
  {
    nome: "outro site, com Sec-Fetch-Site: cross-site",
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    esperado: 403
  },
  { nome: "Sec-Fetch-Site: same-site (subdomínio de outro serviço)", headers: { "sec-fetch-site": "same-site" }, esperado: 403 },
  { nome: "Sec-Fetch-Site: cross-site, sem Origin", headers: { "sec-fetch-site": "cross-site" }, esperado: 403 }
];

for (const rota of ["/auth/entrar", "/auth/sair"]) {
  test.describe(`POST ${rota}`, () => {
    for (const caso of CASOS) {
      test(`${caso.nome} → ${caso.esperado}`, async ({ request }) => {
        const resposta = await request.post(rota, {
          form: { token_hash: TOKEN, type: "email" },
          headers: caso.headers,
          maxRedirects: 0
        });
        expect(resposta.status()).toBe(caso.esperado);
      });
    }
  });
}

test("GET /auth/sair continua a ser recusado (só POST)", async ({ request }) => {
  const resposta = await request.get("/auth/sair", { maxRedirects: 0 });
  expect(resposta.status()).toBe(405);
});

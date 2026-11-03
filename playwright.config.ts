import { defineConfig } from "@playwright/test";

// Testes do login (origem dos POST de /auth/entrar e /auth/sair).
//
// Corre contra o site REAL compilado (`next build` + `next start`), com um
// Supabase de mentira (127.0.0.1:59999, sem nada à escuta): os testes não falam com
// a base de dados verdadeira e não precisam de contas. Um POST que passa a
// verificação de origem e falha a verificação do código acaba em
// `/login?erro=link` (303); um POST recusado dá 403.
//
// Usa o Chrome instalado (canal "chrome"), por isso não descarrega browsers.
// Noutro computador sem Chrome: PW_CHANNEL=msedge npm run test:e2e, ou
// `npx playwright install chromium` e PW_CHANNEL=chromium.
const PORT = 3101;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "chrome"
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59999",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-falsa-so-para-testes"
    }
  }
});

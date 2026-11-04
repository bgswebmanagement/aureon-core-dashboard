import { defineConfig } from "@playwright/test";

// Testes do login e do acesso a /admin.
//
// Corre contra o site REAL compilado (`next build` + `next start`) e contra um
// Supabase DE MENTIRA (e2e/fake-supabase.mjs): os testes não falam com a base
// de dados verdadeira, não precisam de contas e conseguem provar, com o
// registo de pedidos do falso Supabase, que uma conta sem papel de
// administrador nunca chega a usar a chave de administração.
//
// Usa o Chrome instalado (canal "chrome"), por isso não descarrega browsers.
// Noutro computador sem Chrome: PW_CHANNEL=msedge npm run test:e2e, ou
// `npx playwright install chromium` e PW_CHANNEL=chromium.
const APP_PORT = 3101;
const FAKE_PORT = 54329;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    channel: process.env.PW_CHANNEL ?? "chrome"
  },
  webServer: [
    {
      command: "node e2e/fake-supabase.mjs",
      url: `http://127.0.0.1:${FAKE_PORT}/__health`,
      timeout: 30_000,
      reuseExistingServer: false,
      env: { FAKE_SUPABASE_PORT: String(FAKE_PORT) }
    },
    {
      command: `npm run build && npx next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/login`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-falsa-so-para-testes",
        SUPABASE_SERVICE_ROLE_KEY: "service-key-falsa"
      }
    }
  ]
});

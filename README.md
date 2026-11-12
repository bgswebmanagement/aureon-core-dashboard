# Aureon Core — Dashboard

Owner ("Proprietário/Gestor"), tenant ("Inquilino") and Aureon Core internal ("Admin")
dashboards for the Aureon Core pilot — a real Next.js + Supabase app, so it can go from demo to
the actual 10-unit pilot without a rewrite.

## Roles & access

- **`/proprietario`** — owner/agency. Sees only what's needed to protect the property: hub
  ambient conditions and leak events. Does not see motion or door/window events unless the
  tenant has explicitly authorized it (see Privacy model below).
- **`/inquilino`** — tenant. Always sees everything about their own home, including a
  **`/inquilino/privacidade`** page where they grant/revoke the owner's access to restricted data
  categories.
- **`/admin`** — Aureon Core's own internal operator view (Bruno's access). Unrestricted, same
  level of visibility as the Supabase Table Editor gives today. **Deliberately not linked** from
  the public landing page (`app/page.tsx`) — reachable only by going directly to that URL. Treat
  the URL itself as the access control for now, the same way direct Supabase Table Editor access
  already is; add real auth + an `admin` role check (see `profiles.role` in
  `supabase/schema.sql`) before this is used with real tenant data at scale.

## Privacy model ("privacy-first" in practice)

The pilot's privacy positioning isn't just messaging — it's enforced in what each role can see:

- **Tenant** sees all data about their own home, always.
- **Owner/agency** sees, by default, only what's relevant to managing and protecting the
  property: hub ambient readings (temperature, humidity, air quality) and **leak** events. A
  leak is property-damage risk, not personal activity, so it's never gated.
- **Motion** and **door/window** events are presence/behaviour data — they reveal when someone
  is home and moving around, not property condition — so they're hidden from the owner by
  default. The tenant can explicitly authorize the owner to see one of these categories for their
  property (e.g. to help resolve a noise/activity dispute), at `/inquilino/privacidade`. That
  authorization is scoped to one category, one property, and can be revoked at any time.
- **Admin** (Aureon Core staff) is not subject to this restriction, matching existing raw
  database access.

Implementation: `lib/types.ts` (`ViewerRole`, `RestrictedCategory`, `ConsentGrant`),
`lib/consent.ts` (the filtering logic), and `supabase/schema.sql`'s `consent_grants` table. Every
screen that shows satellite events (`SatelliteCard`, `HistoryClient`, the dispute report at
`/report/[id]`) passes a `viewerRole` + the property's consent grants through this filter, and
shows a small lock indicator/count whenever something is hidden — so an owner always knows data
exists but isn't visible, rather than silently seeing an incomplete picture. (The demo seed data
no longer exists: the app only shows real data, read with the signed-in user's session.)

Consent changes made in `/inquilino/privacidade` **are persisted** in `consent_grants` (see
"Páginas do inquilino" below); the database rules and views enforce what the owner sees.

## Hardware model (important)

The dashboard reflects the real pilot hardware, not a generic "smart home" mockup:

- **One Hub per property.** Plugs into power + Wi-Fi, installed in a single room. Its onboard
  sensors (temperature, humidity, VOC/air quality, pressure) measure ambient conditions for the
  whole home from wherever it sits — there is no per-room sensor grid.
- **1-3 battery-powered Satellites** (Remote Sensor Nodes) per property. These look like smoke
  alarms and report discrete **events**, not a continuous feed: a water leak detected, motion
  seen, a door/window opened or closed. The typical pilot placement is one leak+motion satellite
  in the bathroom (the room most likely to leak), plus optional door/window satellites elsewhere.
- **No smoke/CO detection anywhere.** The Pilot Program Agreement explicitly states the System is
  not a certified smoke, carbon-monoxide, or fire-detection device — an earlier version of this
  dashboard showed a "smoke detector" per room, which didn't match the hardware or the legal
  disclaimer, and has been removed.

This matches the architecture in the Sensor Architecture document shared with Count Customs
(Jan 2026), the Hub/RSN PCB testing updates (Jul–Aug 2026), and the device description in the
Pilot Program Agreement ("temperatura, humidade, aberturas de portas/janelas, movimento, fuga de
água").

## What's different from the original Manus prototype

- **Real data layer, not client-side simulation.** The Manus version ran entirely in the browser
  with `setInterval`-based random jitter and no backend. This version has a proper data-access
  layer (`lib/data.ts`) that reads from Supabase with the signed-in user's session (or the admin
  client for `/admin`). The original demo/seed data has been removed.
- **A real ingest endpoint.** `POST /api/ingest` accepts one Hub ambient reading plus any
  satellite events since the last sync — see [API contract for Count Customs](#api-contract-for-count-customs)
  below.
- **No fake live jitter.** Real hubs report every ~10 minutes. Data here is stable and
  reproducible instead of randomly drifting every 4 seconds.
- **History tab is complete**: date/time stamps, filterable by property and metric, plus a
  "Gerar Relatório" export for landlord-tenant disputes (`/report/[propertyId]`) with contiguous
  breach periods (e.g. "humidity above 70% for 14h, 12–13 Aug") and a satellite event log for the
  same period.
- **Alerts/Insights are computed from thresholds**, not hand-written strings, so they stay
  correct as real data comes in (humidity > 70% → mould risk, VOC > 120 → poor air, VOC > 200 or
  a satellite leak event → critical).

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app needs the Supabase environment variables (see below) — there is
no demo mode any more; without them the data pages show a clear error instead of invented data.

## Deploying

The fastest path (no GitHub needed):

```bash
npm install -g vercel
vercel --prod
```

Follow the prompts (link or create a project). That's it — Vercel auto-detects Next.js.

Alternatively, drag the project folder into [vercel.com/new](https://vercel.com/new), or connect
a GitHub repo from the Vercel dashboard.

## Going live with the 10 pilot hubs (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `supabase/schema.sql` once.
3. In Vercel (Project → Settings → Environment Variables), set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (used only server-side, by `/api/ingest`)
   - `INGEST_TOKEN` (optional shared secret — give the same value to Count Customs)
4. In the Supabase table editor, insert one row per `properties`, one `hubs` row per property
   (its `device_id` must match what Count Customs flashes onto that unit), and one `satellites`
   row per RSN unit (its `device_id` must match the `node_id` the Hub relays).
5. Redeploy.

## Login (Supabase Auth, link por email)

Sem palavra-passe: `/login` envia um link por email; `/auth/confirm` mostra o botão "Entrar" (abrir o
link não gasta o código); `/auth/entrar` verifica o código e leva cada pessoa à página do seu papel
(`profiles.role`: `admin` → `/admin`, `owner` → `/proprietario`, `tenant` → `/inquilino`); `/auth/sair`
termina a sessão. Só entra quem já existe em Supabase (`shouldCreateUser: false`).

**Administrador com palavra-passe:** em `/login`, o separador «Administrador» (email + palavra-passe, só POST
para `/auth/palavra-passe`) existe só para contas com `profiles.role = 'admin'`. Qualquer falha (email que não
existe, palavra-passe errada, conta desativada, conta que não é de administrador) dá a mesma mensagem, «Email ou
palavra-passe incorretos.»; uma conta que não seja de administrador nunca recebe cookie de sessão. Donos e
inquilinos continuam a entrar só por link no email. A palavra-passe define-se no Supabase (Authentication →
Users); nunca vai para o código, para a URL nem para os registos.

Exigem login: `/admin` (administrador), `/proprietario` (dono), `/inquilino` (inquilino) e `/report/[id]`. O middleware apenas renova o cookie e não corre em `/api/*` (o `/api/ingest` do firmware
não é tocado).

Configuração necessária:

1. Vercel: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` em Production **e** Preview.
   Sem elas o login fica desligado (modo demonstração).
2. Supabase → Authentication:
   - Sign In / Providers → Email: desligar "Allow new users to sign up".
   - URL Configuration: Site URL e Redirect URLs (produção, previews da Vercel, `http://localhost:3000/**`).
   - Email Templates: colar `supabase/email_templates/magic_link.html` (e `invite_user.html` a partir do PR 3).
   - SMTP próprio (o envio por defeito do Supabase é muito limitado).
3. Criar o primeiro administrador: Authentication → Users → Add user, e depois inserir a linha em
   `profiles` com `role = 'admin'`.

### Administração de utilizadores (`/admin/utilizadores`)

`/admin` só abre para contas com `profiles.role = 'admin'` (sem sessão vai para `/login`; outro papel volta
à sua página). A verificação repete-se no layout, em cada página e em **cada ação do servidor**
(`withAdmin`), sempre no servidor. Convida por email (papel + casas), reenvia o link, muda as casas e
desativa/reativa contas. O convite usa a chave de administração (`SUPABASE_SERVICE_ROLE_KEY`) e grava
`profiles`, `property_members` e, para inquilinos, `tenants.user_id`. Contas de administrador criam-se à mão.
Requer o modelo de email **Invite user** (`supabase/email_templates/invite_user.html`) colado no Supabase.

Testes do login e do acesso a `/admin` (browser real + pedidos manuais, contra o site compilado e um
Supabase de mentira em `e2e/fake-supabase.mjs`, sem tocar na base de dados): `npm run test:e2e`. Usa o Chrome instalado (`PW_CHANNEL=msedge` para o Edge).
Cobrem a verificação de origem de `/auth/entrar` e `/auth/sair`, incluindo `Origin: null` (que os
browsers enviam quando a página tem `referrer: no-referrer`) e pedidos de outros sites.

### Páginas do dono (`/proprietario`): leitura com a sessão da própria pessoa

As páginas do dono **não usam a chave de administração**. Lêem com a sessão de quem está autenticado
(`lib/owner/scope.ts` → `requireOwnerScope()`, chamado no layout e em **cada** página) e quem decide o
que ele vê é a base de dados (casas por `property_members`, consentimento do inquilino, vistas
`sensor_readings_visible` e `satellites_visible`). Sem sessão vai para `/login`; administrador para
`/admin`; inquilino para `/inquilino`; conta sem papel para `/sem-acesso`. Dono sem casas vê um ecrã
vazio; se a leitura falhar vê uma mensagem clara — **nunca dados de demonstração**.

Camadas de dados: `lib/data-rules.ts` (regras puras), `lib/data-scope.ts` (com que identidade se lê:
administrador ou sessão) e `lib/data.ts` (`createDataReader(scope)`). O antigo modo `legacy` (chave de
administração sem login) e os dados de demonstração (`lib/seed.ts`) **foram apagados**; um teste falha se
voltarem. Regras de ouro: sem `unstable_cache`, sem
`revalidate`, sem dados em variáveis de módulo; o cliente de sessão faz `fetch` com `cache: "no-store"` e
o layout do dono tem `dynamic = "force-dynamic"` e `fetchCache = "force-no-store"`. Dos eventos dos
satélites só se lêem `node_id`, `event` e `recorded_at` (nunca `battery` nem `rssi`).
`/report/[id]` exige login (`lib/report-scope.ts`): o administrador abre qualquer casa; dono e inquilino só as
suas, lidas com a sessão deles. Casa alheia e casa inexistente dão a mesma resposta (`/sem-acesso?motivo=relatorio`).
O relatório é sempre o documento do dono: movimento e porta/janela só aparecem com autorização do inquilino,
mesmo para o administrador e o inquilino, e não diz quantos eventos ficaram de fora.
O alerta de fuga conta só eventos `leak_detected` e fica ativo até alguém o limpar (ainda por fazer).

### Páginas do inquilino (`/inquilino`) e consentimentos

O inquilino lê **tudo da sua casa** com a sua própria sessão (`lib/tenant/scope.ts` → `requireTenantScope()`,
no layout e em cada página): leituras do hub incluindo o som, satélites com bateria exata e estado, eventos
de fuga/movimento/porta, alertas e histórico. A casa é a primeira por ordem do nome, com o nome bem visível
no topo (mostra «1.ª de N casas» se tiver várias). Sem casa: ecrã vazio; falha de leitura: erro claro.
Sem sessão → `/login`; administrador → `/admin`; dono → `/proprietario`; sem papel → `/sem-acesso`.

`/inquilino/privacidade` dá e retira autorizações ao dono **a sério** através da ação do servidor
`setConsent` (`app/inquilino/privacidade/actions.ts`): só o papel inquilino; a casa vem **sempre da sessão**
(nunca do que o browser envia); só `motion`, `doorWindow` e `sound`; grava com a sessão do inquilino (as regras
da base de dados valem sempre); retirar põe `active = false`; conceder desativa primeiro a autorização
expirada dessa casa e categoria (o índice único conta as expiradas) e depois cria a nova. **Sem prazo no
piloto** (`expires_at` vazio): o inquilino retira quando quiser. Uma autorização expirada nunca conta como ativa.

SQL do PR 5 (`supabase/auth_pr5_up.sql`, **por aplicar com autorização**): o inquilino lê só a sua própria
linha em `tenants` (`user_id = auth.uid()`), para o relatório mostrar o nome dele. Reverter: `auth_pr5_down.sql`;
testes de ensaio (com ROLLBACK): `auth_pr5_tests.sql`.

## API contract for Count Customs

Send this section to Chirantan once you have a deployed URL:

```
POST https://<your-vercel-domain>/api/ingest
Authorization: Bearer <INGEST_TOKEN>        (only if INGEST_TOKEN is set)
Content-Type: application/json

{
  "device_id": "AC-HUB-0001",
  "timestamp": "2026-09-01T10:00:00Z",
  "temperature": 22.4,
  "humidity": 58,
  "voc": 45,
  "pressure": 1013.2,
  "rsn_events": [
    {
      "node_id": "AC-RSN-0007",
      "event": "leak_detected",
      "battery": 92,
      "rssi": -61,
      "timestamp": "2026-09-01T09:58:00Z"
    }
  ]
}
```

- `device_id` must match the `hubs.device_id` value inserted in Supabase for that unit.
- Send the Hub's onboard ambient readings (`temperature`/`humidity`/`voc`/`pressure`) roughly
  every 10 minutes.
- Include `rsn_events` only when a satellite event actually occurs (event-driven, not polled).
  `event` should be one of `leak_detected`, `motion_detected`, `door_open`, `door_closed`.
- Works fine before Supabase is configured too — the endpoint accepts the payload and returns
  `{"ok": true, "mode": "demo", "persisted": false}` so Count Customs can test connectivity
  end-to-end before Supabase credentials exist.

## Known gaps / next steps

- **Login existe** (admin, dono, inquilino e relatório exigem sessão — ver «Login» acima). Falta:
  a landing page `/` ainda tem o seletor de papéis de demonstração (PR 7), o alerta de fuga ainda não
  se pode limpar, e o `supabase/schema.sql` consolidado precisa de ser atualizado com os ficheiros
  `supabase/auth_pr*.sql`.
- **Privacidade por categoria (movimento/porta/som) é aplicada na base de dados** (regras RLS e vistas
  `sensor_readings_visible` / `satellites_visible`; ver `supabase/auth_pr1_up.sql`) e a aplicação lê sempre
  com a sessão de quem pede, por isso não depende só de `lib/consent.ts`.
- **No offline queue on the API side** — the Hub firmware is responsible for buffering readings
  while offline and retrying `/api/ingest` once connectivity returns.
- Two known Next.js 14.2.x security advisories remain (SSRF via rewrites, Server Function
  endpoint disclosure) that are only fixed in Next 16 — not exploitable here since this app
  doesn't use rewrites or Server Actions, but worth upgrading before general availability.

## Project structure

```
app/                    Routes (App Router)
  proprietario/          Owner dashboard (dispositivos, propriedades, historico, alertas, insights, inquilinos)
  inquilino/              Tenant dashboard (+ privacidade — consent controls)
  admin/                  Aureon Core internal dashboard (unlinked from "/", direct URL only)
  report/[id]/            Printable dispute-evidence report (owner-level privacy filter applied)
  api/ingest/              Hub -> cloud sync endpoint
components/              UI components (HubCard, SatelliteCard, PropertyCard, AlertCard,
                          DevicesView, PropertyDetailView, ConsentManager, ...)
lib/
  data-rules.ts           Pure rules: thresholds, alerts, insights
  data-scope.ts           Who is reading (admin or the user's session)
  data.ts                 createDataReader(scope): single data-access surface
  consent.ts              Privacy filtering: which satellite event categories a viewer role sees
  types.ts, ui.ts, nav.ts, report.ts, readings.ts, supabase.ts (ingest only)
  owner/, tenant/, admin/ Per-role guards (requireOwnerScope, requireTenantScope, requireAdminPage)
supabase/schema.sql      Full schema (properties, hubs, satellites, sensor_readings, rsn_events,
                          alerts, profiles, consent_grants) + Row Level Security for the 10-pilot
                          rollout
```

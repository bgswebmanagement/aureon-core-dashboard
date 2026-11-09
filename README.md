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
exists but isn't visible, rather than silently seeing an incomplete picture. The demo seed data
includes one active grant (property `p2`, `motion`, "disputa de ruído") so both the default
locked state (p1, p3) and the unlocked-by-consent state (p2) are visible side by side.

Consent changes made in `/inquilino/privacidade` today are **not yet persisted** — there's no
Supabase `consent_grants` table wired up until Supabase is configured (see below). The UI says so
directly ("modo demo").

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
  layer (`lib/data.ts`) that reads from seed data today and from Supabase once configured —
  same component code either way.
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

Open http://localhost:3000. With no environment variables set, the app runs in **demo mode**:
3 seeded pilot properties, fully interactive, no backend required.

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
5. Redeploy. The app automatically switches from seed data to Supabase — no code changes.

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

Só `/admin` exige login (de administrador); as páginas de dono e inquilino e `/report/[id]` continuam abertas até
aos próximos passos. O middleware apenas renova o cookie e não corre em `/api/*` (o `/api/ingest` do firmware
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
administrador, sessão ou o modo antigo `legacy`) e `lib/data.ts` (`createDataReader(scope)`). O modo
`legacy` (chave de administração sem login) só sobra em `/inquilino` e `/report/[id]` até serem passados
à sessão; um teste falha se for usado noutro sítio. Regras de ouro: sem `unstable_cache`, sem
`revalidate`, sem dados em variáveis de módulo; o cliente de sessão faz `fetch` com `cache: "no-store"` e
o layout do dono tem `dynamic = "force-dynamic"` e `fetchCache = "force-no-store"`. Dos eventos dos
satélites só se lêem `node_id`, `event` e `recorded_at` (nunca `battery` nem `rssi`).
O alerta de fuga conta só eventos `leak_detected` e fica ativo até alguém o limpar (ainda por fazer).

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

- **Auth isn't wired yet.** The role picker on `/` just routes to `/proprietario` or
  `/inquilino` — there's no login, and `/admin` is reachable by anyone who knows the URL.
  `supabase/schema.sql` already has `profiles` (now including an `admin` role) + Row Level
  Security ready for Supabase Auth; wiring the actual sign-in flow (magic link is the easiest for
  10 non-technical tenants) is the next real step before the pilot goes live — at that point
  `/admin` should also gate on `profiles.role = 'admin'` instead of relying on the URL being
  unlisted.
- **Tenant role is pinned** to one demo property (`lib/tenant.ts`) until auth exists.
- **Consent grants aren't persisted yet.** `ConsentManager` (used by
  `/inquilino/privacidade`) holds grants in local React state only. Once Supabase is live, wire
  its `grant()`/`revoke()` handlers to write to the `consent_grants` table (a Server Action or
  API route) instead of just updating local state.
- **Category-level privacy (motion/doorWindow) is enforced in the app layer today**
  (`lib/consent.ts`), not yet at the database/RLS level — see the note above
  `consent_grants`' policies in `supabase/schema.sql` for how to harden this later (a view or
  security-definer RPC that joins `rsn_events` against `consent_grants`).
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
  seed.ts                Demo dataset (1 hub + 1-3 satellites per property) + alert/insight engine
                          + demo consent grants
  data.ts                 Single data-access surface (seed today, Supabase once configured)
  consent.ts              Privacy filtering: which satellite event categories a viewer role sees
  types.ts, ui.ts, nav.ts, report.ts, supabase.ts, tenant.ts
supabase/schema.sql      Full schema (properties, hubs, satellites, sensor_readings, rsn_events,
                          alerts, profiles, consent_grants) + Row Level Security for the 10-pilot
                          rollout
```

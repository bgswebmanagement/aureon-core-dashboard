# Aureon Core — Hub dashboard

Next.js 14 (App Router) + TypeScript + Tailwind dashboard for the Aureon Core smart-home safety pilot (landlord/tenant dispute evidence). The owner is Bruno Santos (Aureon Core Sàrl, Switzerland); he is non-technical and speaks Portuguese — explain steps simply, in Portuguese, and do the work yourself whenever possible. UI text is currently Portuguese (pt-PT).

## Hardware / product model
- ONE Hub per property (ESP32-S3): temperature, humidity, VOC, pressure, and (new) ambient sound LEVEL `sound_dbfs`. **No audio is ever recorded or stored — only a single dBFS number.** Never add audio capture.
- 1–3 Satellites (Remote Sensor Nodes, ESP32-C6, battery): discrete events — `leak_detected`, `motion_detected`, `door_open`, `door_closed`.
- Hardware partner: Count Customs (Chirantan Kansara, Nashik, India) — they flash the firmware. The firmware POSTs to the ingest endpoint; do NOT break its contract.

## Data flow
- `POST /api/ingest` (`app/api/ingest/route.ts` — NOT `app/route.ts`; a stray `app/route.ts` conflicts with `app/page.tsx` and breaks the build). Auth: `Authorization: Bearer <INGEST_TOKEN>`. Body: `{device_id, timestamp, temperature, humidity, voc, pressure, sound_dbfs, rsn_events: [{node_id, event, battery, rssi, timestamp}]}`. Types in `lib/types.ts` (`IngestPayload`).
- Supabase project **"Aureon core Hub software"**, ref `rgeatevobncqzztvfqcb` (eu-west-1). Tables: properties, hubs, sensor_readings, rsn_events, satellites, tenants, alerts, profiles, consent_grants. Schema: `supabase/schema.sql`. Other Supabase projects in the account (property-passport, rental-passport, aureon-prospect) are different products — don't touch.
- `lib/data.ts` is the single data layer. It reads Supabase with the SERVICE ROLE client (no auth yet), builds one per-request snapshot with React `cache()` (`getLiveSnapshot`), falls back to seed data (`lib/seed.ts`) on error. If a property has several hub rows it keeps the one with the newest `last_seen` (dedup happens BEFORE building `Hub[]`). Alert/insight timestamps use the reading's `recorded_at`, not `new Date()`.
- `/admin`, `/proprietario`, `/inquilino` layouts export `dynamic = "force-dynamic"` — keep it, otherwise pages freeze at build time.

## Privacy model (core to the brand: "privacy-first")
Tenant sees everything about their home. Owner/agency sees hub readings + leak events by default; motion and door/window events are hidden unless the tenant grants consent (`lib/consent.ts`, `consent_grants`). Consider whether `sound_dbfs` should also be a restricted category. Aggregated/anonymised data may be used for product improvement; individual data is never shared or sold.

## Deploy / infra
- GitHub `bgswebmanagement/aureon-core-dashboard`, branch `main` → Vercel project `aureon-core-dashboard-u1c4` (auto-deploys on push). Prefer a branch + PR so Vercel makes a preview first.
- Domains: `hub.aureoncore.cloud` (dashboard) and `ingest.aureoncore.cloud` (firmware endpoint — permanent, never change it). Old `aureon-core-dashboard-u1c4.vercel.app` still works. Later: `hub.aureoncore.pt` and `hub.aureoncore.ch` on the SAME project.
- Env vars live in Vercel (never commit secrets, tokens or `.env` files): `INGEST_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc. Bruno plans to move off Vercel/Supabase to his own server later — keep the code portable (plain Postgres + standard Next.js, no vendor-specific lock-in where avoidable).

## Planned work (in priority order)
1. i18n: Portuguese, French, English (German maybe) with `next-intl`; default language chosen by host (`.pt`→pt, `.ch`→fr, `.cloud`→en) plus a language switcher. All UI strings are currently hard-coded Portuguese in `app/` and `components/`.
2. Show `sound_dbfs` in the dashboard (history chart + hub card).
3. Real login (Supabase Auth): owner/tenant pages should read with the anon client under RLS; only `/admin` keeps the service role and must check `role = 'admin'`.
4. Persist consent grants from `/inquilino/privacidade` to the `consent_grants` table.
5. A way to clear a leak alert (firmware never sends a "resolved" event today).
6. Provision the remaining 9 pilot properties (device list in `aureon_pilot_devices.csv` if present).

## Working rules
- Run `npm run build` before pushing; all `/admin`, `/proprietario`, `/inquilino`, `/report/[id]` routes must stay dynamic (ƒ).
- Keep changes small and explain what changed in plain Portuguese. Don't push straight to `main` for large changes.

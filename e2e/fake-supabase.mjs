// Supabase DE MENTIRA, só para os testes (nunca fala com a base de dados real).
// Implementa o mínimo que a app usa: sessão (/auth/v1/user, /verify, /otp,
// /logout), API de administração (/invite, /admin/users) e a API REST das
// tabelas, com dados em memória. Regista TODOS os pedidos em /__log, marcando
// os que usam a chave de administração ("service"): é assim que os testes
// provam que uma conta que não é administrador nunca chega a usá-la.
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54329);
export const SERVICE_KEY = "service-key-falsa";

// Palavras-passe de TESTE para o login do administrador: geradas ao acaso em
// cada corrida e entregues aos testes por /__credentials (nunca escritas no código).
const PASSWORD = { admin: randomUUID(), owner: randomUUID(), tenant: randomUUID(), norole: randomUUID(), banned: randomUUID() };
const CREDENTIALS = [
  { key: "admin", email: "admin@teste.invalid", token: "tok-admin" },
  { key: "owner", email: "dono@teste.invalid", token: "tok-owner" },
  { key: "tenant", email: "inquilino@teste.invalid", token: "tok-tenant" },
  { key: "norole", email: "semperfil@teste.invalid", token: "tok-norole" },
  { key: "banned", email: "admin-desativado@teste.invalid", token: "tok-banned" }
];

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

function initialState() {
  const users = [
    { id: "a0000000-0000-4000-8000-000000000001", email: "admin@teste.invalid", confirmed: true },
    { id: "b0000000-0000-4000-8000-000000000002", email: "dono@teste.invalid", confirmed: true },
    { id: "c0000000-0000-4000-8000-000000000003", email: "inquilino@teste.invalid", confirmed: true },
    { id: "d0000000-0000-4000-8000-000000000004", email: "semperfil@teste.invalid", confirmed: true },
    { id: "e0000000-0000-4000-8000-000000000005", email: "pendente@teste.invalid", confirmed: false },
    // administrador com o acesso desativado (banido)
    { id: "f0000000-0000-4000-8000-000000000006", email: "admin-desativado@teste.invalid", confirmed: true, banned: "2999-01-01T00:00:00Z" },
    // segundo dono (com a Casa Dois) e dono sem casas — para os testes de isolamento
    { id: "70000000-0000-4000-8000-000000000007", email: "dono2@teste.invalid", confirmed: true },
    { id: "80000000-0000-4000-8000-000000000008", email: "dono-sem-casas@teste.invalid", confirmed: true }
  ];
  const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
  return {
    users,
    tables: {
      profiles: [
        { id: users[0].id, role: "admin" },
        { id: users[1].id, role: "owner" },
        { id: users[2].id, role: "tenant" },
        { id: users[4].id, role: "owner" },
        { id: users[5].id, role: "admin" },
        { id: users[6].id, role: "owner" },
        { id: users[7].id, role: "owner" }
      ],
      property_members: [
        { user_id: users[1].id, property_id: P1 },
        { user_id: users[6].id, property_id: P2 },
        { user_id: users[2].id, property_id: P1 } // inquilino da Casa Um
      ],
      properties: [
        { id: P1, name: "Casa Um", address: "Rua 1", city: "Lisboa" },
        { id: P2, name: "Casa Dois", address: "Rua 2", city: "Porto" }
      ],
      tenants: [],
      hubs: [
        { id: "hub-1", device_id: "AC-HUB-0001", property_id: P1, location: "Sala Um", last_seen: ago(2) },
        { id: "hub-2", device_id: "AC-HUB-0002", property_id: P2, location: "Sala Dois", last_seen: ago(3) }
      ],
      // Valores DISTINTIVOS de propósito (bateria 87/63, som -37.25/-52.75, e nos
      // eventos battery 36–38 e rssi -92…-94), para os testes provarem o que o
      // dono vê e o que não vê.
      satellites: [
        { id: "sat-1", device_id: "AC-RSN-0001", hub_id: "hub-1", property_id: P1, label: "Casa de Banho Um", capabilities: ["leak", "motion"], battery: 87, last_seen: ago(9) },
        { id: "sat-2", device_id: "AC-RSN-0002", hub_id: "hub-2", property_id: P2, label: "Casa de Banho Dois", capabilities: ["leak", "motion"], battery: 63, last_seen: ago(11) }
      ],
      sensor_readings: [
        { id: "r1", hub_id: "hub-1", property_id: P1, recorded_at: ago(2), temperature: 21.5, humidity: 48, voc: 90, pressure: 1010, sound_dbfs: -37.25, sound_max_dbfs: -20.5, sound_loud_seconds: 3 },
        { id: "r2", hub_id: "hub-2", property_id: P2, recorded_at: ago(3), temperature: 23.5, humidity: 52, voc: 95, pressure: 1011, sound_dbfs: -52.75, sound_max_dbfs: -40.5, sound_loud_seconds: 4 }
      ],
      rsn_events: [
        { id: "e1", node_id: "AC-RSN-0001", hub_id: "hub-1", property_id: P1, event: "motion_detected", recorded_at: ago(9), battery: 37, rssi: -93 },
        { id: "e2", node_id: "AC-RSN-0001", hub_id: "hub-1", property_id: P1, event: "leak_detected", recorded_at: ago(2880), battery: 38, rssi: -94 },
        { id: "e3", node_id: "AC-RSN-0002", hub_id: "hub-2", property_id: P2, event: "motion_detected", recorded_at: ago(11), battery: 36, rssi: -92 }
      ],
      consent_grants: []
    },
    log: [],
    // true = as leituras das contas de utilizador falham (erro 500), para testar o ecrã de erro
    failUserReads: false
  };
}

let state = initialState();

const userJson = (u) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  email: u.email,
  email_confirmed_at: u.confirmed ? "2026-01-01T00:00:00Z" : null,
  confirmed_at: u.confirmed ? "2026-01-01T00:00:00Z" : null,
  last_sign_in_at: u.confirmed ? "2026-10-01T00:00:00Z" : null,
  banned_until: u.banned ?? null,
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
});

const ROLE_BY_TOKEN = { "tok-admin": 0, "tok-owner": 1, "tok-tenant": 2, "tok-norole": 3, "tok-owner2": 6, "tok-owner0": 7 };

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(payload);
}

function applyFilters(rows, params) {
  let out = rows;
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const m = /^(eq|in)\.(.*)$/.exec(value);
    if (!m) continue;
    if (m[1] === "eq") out = out.filter((r) => String(r[key]) === m[2]);
    else {
      const list = m[2].replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
      out = out.filter((r) => list.includes(String(r[key])));
    }
  }
  return out;
}

function applyOrderLimit(rows, params) {
  let out = rows;
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === "desc" ? -1 : 1));
  }
  const limit = Number(params.get("limit"));
  return limit > 0 ? out.slice(0, limit) : out;
}

// O que uma conta de UTILIZADOR (não a chave de administração) consegue ler,
// imitando as regras reais da base de dados: só as suas casas, vistas que
// escondem o que o consentimento não permite, e NADA das tabelas de base
// sensor_readings / satellites. Devolve null = «permission denied».
function userVisibleRows(table, user, params) {
  const role = state.tables.profiles.find((p) => p.id === user.id)?.role;
  const props = new Set(state.tables.property_members.filter((m) => m.user_id === user.id).map((m) => m.property_id));
  const mine = (rows) => rows.filter((r) => props.has(r.property_id));
  const consent = (pid, category) =>
    (state.tables.consent_grants ?? []).some((g) => g.property_id === pid && g.category === category && g.active);
  const sees = (pid, category) => role === "tenant" || consent(pid, category);
  switch (table) {
    case "profiles":
      return state.tables.profiles.filter((p) => p.id === user.id);
    case "property_members":
      return state.tables.property_members.filter((m) => m.user_id === user.id);
    case "properties":
      return state.tables.properties.filter((p) => props.has(p.id));
    case "hubs":
    case "tenants":
    case "consent_grants":
      return mine(state.tables[table] ?? []);
    case "sensor_readings_visible":
      return mine(state.tables.sensor_readings ?? []).map((r) => {
        const sound = sees(r.property_id, "sound");
        return { ...r, sound_dbfs: sound ? r.sound_dbfs : null, sound_max_dbfs: sound ? r.sound_max_dbfs : null, sound_loud_seconds: sound ? r.sound_loud_seconds : null };
      });
    case "satellites_visible":
      return mine(state.tables.satellites ?? []).map((s) => {
        const restricted = s.capabilities.filter((c) => c === "motion" || c === "doorWindow");
        const activity = restricted.every((c) => sees(s.property_id, c));
        return { ...s, battery: activity ? s.battery : Math.floor(s.battery / 10) * 10, last_seen: activity ? s.last_seen : null };
      });
    case "rsn_events": {
      // Parte C do SQL: sem battery, rssi nem «*».
      const columns = String(params.get("select") ?? "*").split(",").map((c) => c.trim());
      if (columns.some((c) => c === "*" || c === "" || c === "battery" || c === "rssi")) return null;
      return mine(state.tables.rsn_events ?? []).filter((e) => {
        if (e.event === "leak_detected") return true;
        if (e.event === "motion_detected") return sees(e.property_id, "motion");
        if (e.event === "door_open" || e.event === "door_closed") return sees(e.property_id, "doorWindow");
        return false;
      });
    }
    default:
      return null; // inclui sensor_readings, satellites, alerts…
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const service = bearer === SERVICE_KEY;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);

  if (path === "/__health") return send(res, 200, { ok: true });
  if (path === "/__reset") {
    state = initialState();
    return send(res, 200, { ok: true });
  }
  if (path === "/__log") return send(res, 200, state.log);
  if (path === "/__credentials") {
    return send(res, 200, Object.fromEntries(CREDENTIALS.map((c) => [c.key, { email: c.email, password: PASSWORD[c.key] }])));
  }

  if (path === "/__fail" && req.method === "POST") {
    state.failUserReads = body?.on === true;
    return send(res, 200, { ok: true });
  }
  if (path === "/__consent" && req.method === "POST") {
    state.tables.consent_grants.push({
      id: randomUUID(),
      property_id: body.property_id,
      category: body.category,
      reason: null,
      granted_at: new Date().toISOString(),
      expires_at: null,
      active: true
    });
    return send(res, 200, { ok: true });
  }

  // O registo nunca guarda palavras-passe.
  const loggedBody = body && typeof body === "object" && "password" in body ? { ...body, password: "[redigida]" } : body;
  state.log.push({ method: req.method, path, query: url.search, service, token: bearer, body: loggedBody });

  // ----- Auth: entrada com email + palavra-passe ----------------------------
  if (path === "/auth/v1/token" && req.method === "POST" && url.searchParams.get("grant_type") === "password") {
    const email = String(body?.email ?? "").toLowerCase();
    const credential = CREDENTIALS.find((c) => c.email === email);
    const user = state.users.find((u) => u.email === email);
    if (!credential || !user || body?.password !== PASSWORD[credential.key]) {
      return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    if (user.banned) return send(res, 400, { code: 400, error_code: "user_banned", msg: "User is banned" });
    return send(res, 200, {
      access_token: credential.token,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `ref-${credential.key}`,
      user: userJson(user)
    });
  }

  // ----- Auth: sessão ------------------------------------------------------
  if (path === "/auth/v1/user" && req.method === "GET") {
    const index = ROLE_BY_TOKEN[bearer];
    if (index === undefined) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(res, 200, userJson(state.users[index]));
  }

  if (path === "/auth/v1/verify" && req.method === "POST") {
    const type = body?.type;
    const hash = String(body?.token_hash ?? "");
    const role = /^valid-(admin|owner2|owner0|owner|tenant|norole)/.exec(hash)?.[1];
    if (!["invite", "email", "magiclink"].includes(type) || !role) {
      return send(res, 403, { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" });
    }
    const user = state.users[ROLE_BY_TOKEN[`tok-${role}`]];
    return send(res, 200, {
      access_token: `tok-${role}`,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `ref-${role}`,
      user: userJson(user)
    });
  }

  if (path === "/auth/v1/otp" && req.method === "POST") return send(res, 200, {});
  if (path === "/auth/v1/logout") return send(res, 204);

  // ----- Auth: administração (só com a chave de administração) -------------
  if (path.startsWith("/auth/v1/admin/") || path === "/auth/v1/invite") {
    if (!service) return send(res, 401, { code: 401, error_code: "not_admin", msg: "User not allowed" });

    if (path === "/auth/v1/invite" && req.method === "POST") {
      const email = String(body?.email ?? "").toLowerCase();
      const existing = state.users.find((u) => u.email === email);
      if (existing?.confirmed) {
        return send(res, 422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
      }
      const user = existing ?? { id: randomUUID(), email, confirmed: false };
      if (!existing) state.users.push(user);
      return send(res, 200, userJson(user));
    }

    if (path === "/auth/v1/admin/users" && req.method === "GET") {
      return send(res, 200, { users: state.users.map(userJson), aud: "authenticated" }, { "x-total-count": String(state.users.length) });
    }

    const m = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(path);
    if (m) {
      const user = state.users.find((u) => u.id === m[1]);
      if (!user) return send(res, 404, { code: 404, error_code: "user_not_found", msg: "User not found" });
      if (req.method === "GET") return send(res, 200, userJson(user));
      if (req.method === "PUT") {
        if (body?.ban_duration === "none") user.banned = null;
        else if (body?.ban_duration) user.banned = "2999-01-01T00:00:00Z";
        return send(res, 200, userJson(user));
      }
      if (req.method === "DELETE") {
        state.users = state.users.filter((u) => u.id !== user.id);
        return send(res, 200, userJson(user));
      }
    }
    return send(res, 404, { msg: "not implemented in fake" });
  }

  // ----- REST (tabelas) ----------------------------------------------------
  const rest = /^\/rest\/v1\/([a-z_]+)$/.exec(path);
  if (rest) {
    const table = rest[1];
    // Uma conta de utilizador só LÊ, e só o que as regras reais deixam (ver userVisibleRows).
    let userRows = null;
    if (!service) {
      const userIndex = ROLE_BY_TOKEN[bearer];
      const denied = () => send(res, 401, { code: "42501", message: `permission denied for table ${table}` });
      if (userIndex === undefined || req.method !== "GET") return denied();
      if (state.failUserReads && table !== "profiles") return send(res, 500, { code: "XX000", message: "falha simulada" });
      userRows = userVisibleRows(table, state.users[userIndex], url.searchParams);
      if (userRows === null) return denied();
    }
    const rows = userRows ?? state.tables[table] ?? (state.tables[table] = []);
    const accept = String(req.headers.accept ?? "");
    const wantsObject = accept.includes("vnd.pgrst.object");
    const prefersRows = String(req.headers.prefer ?? "").includes("return=representation");
    const reply = (list, status = 200) => (wantsObject ? send(res, status, list[0] ?? null) : send(res, status, list));

    if (req.method === "GET") return reply(applyOrderLimit(applyFilters(rows, url.searchParams), url.searchParams));

    if (req.method === "POST") {
      const items = Array.isArray(body) ? body : [body];
      if (table === "profiles") {
        const failing = state.users.find((u) => u.email === "falha-perfil@teste.invalid");
        if (failing && items.some((i) => i.id === failing.id)) return send(res, 500, { message: "boom (simulado)" });
      }
      const created = items.map((i) => ({ id: table === "tenants" ? randomUUID() : undefined, ...i }));
      rows.push(...created);
      return prefersRows ? reply(created, 201) : send(res, 201);
    }

    if (req.method === "PATCH") {
      const target = applyFilters(rows, url.searchParams);
      target.forEach((r) => Object.assign(r, body));
      return prefersRows ? reply(target) : send(res, 204);
    }

    if (req.method === "DELETE") {
      const target = new Set(applyFilters(rows, url.searchParams));
      state.tables[table] = rows.filter((r) => !target.has(r));
      return send(res, 204);
    }
  }

  // Tabelas/leituras que a app consulta mas que aqui estão vazias.
  return send(res, 404, { msg: "not implemented in fake", path });
});

server.listen(PORT, "127.0.0.1", () => console.log(`fake supabase em http://127.0.0.1:${PORT}`));

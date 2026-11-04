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

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

function initialState() {
  const users = [
    { id: "a0000000-0000-4000-8000-000000000001", email: "admin@teste.invalid", confirmed: true },
    { id: "b0000000-0000-4000-8000-000000000002", email: "dono@teste.invalid", confirmed: true },
    { id: "c0000000-0000-4000-8000-000000000003", email: "inquilino@teste.invalid", confirmed: true },
    { id: "d0000000-0000-4000-8000-000000000004", email: "semperfil@teste.invalid", confirmed: true },
    { id: "e0000000-0000-4000-8000-000000000005", email: "pendente@teste.invalid", confirmed: false }
  ];
  return {
    users,
    tables: {
      profiles: [
        { id: users[0].id, role: "admin" },
        { id: users[1].id, role: "owner" },
        { id: users[2].id, role: "tenant" },
        { id: users[4].id, role: "owner" }
      ],
      property_members: [{ user_id: users[1].id, property_id: P1 }],
      properties: [
        { id: P1, name: "Casa Um", address: "Rua 1", city: "Lisboa" },
        { id: P2, name: "Casa Dois", address: "Rua 2", city: "Porto" }
      ],
      tenants: []
    },
    log: []
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

const ROLE_BY_TOKEN = { "tok-admin": 0, "tok-owner": 1, "tok-tenant": 2, "tok-norole": 3 };

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

  state.log.push({ method: req.method, path, query: url.search, service, token: bearer, body });

  // ----- Auth: sessão ------------------------------------------------------
  if (path === "/auth/v1/user" && req.method === "GET") {
    const index = ROLE_BY_TOKEN[bearer];
    if (index === undefined) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(res, 200, userJson(state.users[index]));
  }

  if (path === "/auth/v1/verify" && req.method === "POST") {
    const type = body?.type;
    const hash = String(body?.token_hash ?? "");
    const role = /^valid-(admin|owner|tenant|norole)/.exec(hash)?.[1];
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
    // Uma conta normal só consegue ler a SUA linha de `profiles` (como as regras reais).
    if (!service) {
      const userIndex = ROLE_BY_TOKEN[bearer];
      const ownProfileRead = table === "profiles" && req.method === "GET" && userIndex !== undefined;
      if (!ownProfileRead) return send(res, 401, { code: "42501", message: `permission denied for table ${table}` });
    }
    const rows = state.tables[table] ?? (state.tables[table] = []);
    const accept = String(req.headers.accept ?? "");
    const wantsObject = accept.includes("vnd.pgrst.object");
    const prefersRows = String(req.headers.prefer ?? "").includes("return=representation");
    const reply = (list, status = 200) => (wantsObject ? send(res, status, list[0] ?? null) : send(res, status, list));

    if (req.method === "GET") return reply(applyFilters(rows, url.searchParams));

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

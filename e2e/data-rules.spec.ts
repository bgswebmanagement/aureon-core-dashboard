import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  buildSnapshot,
  computeHubStatus,
  sustainedVocLevel,
  type RawRows
} from "../lib/data-rules";

// Testes da LÓGICA PURA (lib/data-rules.ts): limites, VOC, alertas, hub
// duplicado. Não usam base de dados nem browser.

const NOW = new Date("2026-11-08T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString();

function rows(partial: Partial<RawRows> = {}): RawRows {
  return {
    properties: [{ id: "p1", name: "Casa Um", address: "Rua 1", city: "Lisboa" }],
    hubs: [{ id: "h1", device_id: "AC-HUB-1", property_id: "p1", location: "Sala", last_seen: minutesAgo(5) }],
    satellites: [],
    tenants: [],
    readings: [],
    events: [],
    consents: [],
    ...partial
  };
}
const reading = (m: number, over: Partial<RawRows["readings"][number]> = {}) => ({
  hub_id: "h1",
  temperature: 21,
  humidity: 50,
  voc: 100,
  sound_dbfs: -40,
  recorded_at: minutesAgo(m),
  ...over
});

// ---------------------------------------------------------------------------
test("limites: humidade e temperatura só passam a «atenção» ESTRITAMENTE acima do limite", () => {
  expect(computeHubStatus(30, 70, null)).toBe("normal");
  expect(computeHubStatus(30.1, 50, null)).toBe("atencao");
  expect(computeHubStatus(20, 70.1, null)).toBe("atencao");
  expect(computeHubStatus(null, null, null)).toBe("normal"); // sem valores nunca alerta
  expect(computeHubStatus(20, 50, "aviso")).toBe("normal"); // VOC «aviso» não muda o estado do hub
  expect(computeHubStatus(20, 50, "critico")).toBe("atencao");
});

test("VOC: precisa de 3 leituras válidas seguidas; o nível é o da mais baixa", () => {
  expect(sustainedVocLevel([{ voc: 500 }, { voc: 500 }])).toBeNull(); // só 2
  expect(sustainedVocLevel([{ voc: 500 }, { voc: 500 }, { voc: 500 }])).toBe("critico");
  expect(sustainedVocLevel([{ voc: 500 }, { voc: 500 }, { voc: 150 }])).toBe("aviso");
  expect(sustainedVocLevel([{ voc: 500 }, { voc: 500 }, { voc: 120 }])).toBeNull(); // 120 não é «acima»
  expect(sustainedVocLevel([{ voc: 201 }, { voc: 201 }, { voc: 200 }])).toBe("aviso"); // 200 não é «acima» do crítico
});

test("VOC: leituras sem VOC (sensor a aquecer) são saltadas e não interrompem a sequência", () => {
  const snap = buildSnapshot(
    rows({ readings: [reading(10, { voc: 300 }), reading(20, { voc: null }), reading(30, { voc: 300 }), reading(40, { voc: 300 })] }),
    NOW
  );
  expect(snap.alerts.filter((a) => a.tag === "Nível de VOC")).toHaveLength(1);
  expect(snap.alerts.find((a) => a.tag === "Nível de VOC")?.severity).toBe("critico");
});

test("VOC: uma leitura alta isolada não gera alerta", () => {
  const snap = buildSnapshot(rows({ readings: [reading(10, { voc: 400 }), reading(20, { voc: 90 }), reading(30, { voc: 90 })] }), NOW);
  expect(snap.alerts).toEqual([]);
});

test("VOC: sem VOC na última leitura mostra o último válido só se for dos últimos 30 minutos", () => {
  const recent = buildSnapshot(rows({ readings: [reading(5, { voc: null }), reading(25, { voc: 130 })] }), NOW);
  expect(recent.hubs[0].voc).toBe(130);
  const old = buildSnapshot(rows({ readings: [reading(5, { voc: null }), reading(31, { voc: 130 })] }), NOW);
  expect(old.hubs[0].voc).toBeNull(); // nunca 0
});

test("valores em falta (null) nunca geram alertas nem conselhos", () => {
  const snap = buildSnapshot(rows({ readings: [reading(5, { temperature: null, humidity: null, voc: null })] }), NOW);
  expect(snap.alerts).toEqual([]);
  expect(snap.insights).toEqual([]);
  expect(snap.hubs[0]).toMatchObject({ temperature: null, humidity: null, voc: null });
});

test("alertas e conselhos usam a hora da LEITURA, não a hora atual", () => {
  const snap = buildSnapshot(rows({ readings: [reading(95, { humidity: 80 })] }), NOW);
  const alert = snap.alerts.find((a) => a.tag === "Risco de Bolor");
  expect(alert?.createdAt).toBe(minutesAgo(95));
  expect(snap.insights.find((i) => i.tag === "Risco de Bolor")?.createdAt).toBe(minutesAgo(95));
});

test("humidade: acima de 70 é bolor (aviso); entre 60 e 70 só um conselho", () => {
  const mold = buildSnapshot(rows({ readings: [reading(5, { humidity: 71 })] }), NOW);
  expect(mold.alerts.map((a) => a.tag)).toEqual(["Risco de Bolor"]);
  expect(mold.properties[0].status).toBe("atencao");
  const mid = buildSnapshot(rows({ readings: [reading(5, { humidity: 65 })] }), NOW);
  expect(mid.alerts).toEqual([]);
  expect(mid.insights.map((i) => i.title)).toEqual(["Ventilação Recomendada"]);
});

test("hub duplicado na mesma casa: fica o que foi visto mais recentemente", () => {
  const snap = buildSnapshot(
    rows({
      hubs: [
        { id: "h-velho", device_id: "AC-HUB-OLD", property_id: "p1", location: "Antigo", last_seen: minutesAgo(5000) },
        { id: "h1", device_id: "AC-HUB-1", property_id: "p1", location: "Sala", last_seen: minutesAgo(5) },
        { id: "h-nunca", device_id: "AC-HUB-NEVER", property_id: "p1", location: "Nunca", last_seen: null }
      ]
    }),
    NOW
  );
  expect(snap.hubs).toHaveLength(1);
  expect(snap.hubs[0].id).toBe("AC-HUB-1");
  expect(snap.hubs[0].online).toBe(true);
});

test("fuga: o último evento do satélite ser leak_detected dá alerta crítico com a hora do evento", () => {
  const snap = buildSnapshot(
    rows({
      satellites: [{ device_id: "AC-RSN-1", property_id: "p1", label: "Casa de Banho", capabilities: ["leak"], battery: 80, last_seen: minutesAgo(3) }],
      events: [{ node_id: "AC-RSN-1", event: "leak_detected", recorded_at: minutesAgo(3) }]
    }),
    NOW
  );
  expect(snap.satellites[0].leakState).toBe("alert");
  expect(snap.properties[0].status).toBe("critico");
  const alert = snap.alerts.find((a) => a.tag === "Fuga de Água");
  expect(alert).toMatchObject({ severity: "critico", active: true, createdAt: minutesAgo(3) });
});

const SAT_LEAK_MOTION = { device_id: "AC-RSN-1", property_id: "p1", label: "WC", capabilities: ["leak", "motion"], battery: 70, last_seen: minutesAgo(3) };

test("fuga: o alerta fica ativo até limparem — movimento ou porta DEPOIS da fuga não o apagam", () => {
  const snap = buildSnapshot(
    rows({
      satellites: [SAT_LEAK_MOTION],
      events: [
        { node_id: "AC-RSN-1", event: "door_closed", recorded_at: minutesAgo(1) },
        { node_id: "AC-RSN-1", event: "motion_detected", recorded_at: minutesAgo(2) },
        { node_id: "AC-RSN-1", event: "leak_detected", recorded_at: minutesAgo(600) },
        { node_id: "AC-RSN-1", event: "leak_detected", recorded_at: minutesAgo(900) }
      ]
    }),
    NOW
  );
  expect(snap.satellites[0].leakState).toBe("alert");
  // a hora do alerta é a da FUGA mais recente, não a do último evento qualquer
  expect(snap.alerts.find((a) => a.tag === "Fuga de Água")?.createdAt).toBe(minutesAgo(600));
});

test("fuga: sem nenhum leak_detected (só movimento/porta) não há alerta", () => {
  const snap = buildSnapshot(
    rows({
      satellites: [SAT_LEAK_MOTION],
      events: [
        { node_id: "AC-RSN-1", event: "motion_detected", recorded_at: minutesAgo(2) },
        { node_id: "AC-RSN-1", event: "door_open", recorded_at: minutesAgo(5) }
      ]
    }),
    NOW
  );
  expect(snap.satellites[0].leakState).toBe("normal");
  expect(snap.alerts).toEqual([]);
});

test("fuga: um satélite sem a capacidade «leak» nunca gera alerta de fuga", () => {
  const snap = buildSnapshot(
    rows({
      satellites: [{ ...SAT_LEAK_MOTION, capabilities: ["motion"] }],
      events: [{ node_id: "AC-RSN-1", event: "leak_detected", recorded_at: minutesAgo(2) }]
    }),
    NOW
  );
  expect(snap.alerts).toEqual([]);
});

test("atividade escondida (dono sem consentimento): sem last_seen é «não sei» (null), nunca «offline»", () => {
  const semAtividade = { ...SAT_LEAK_MOTION, last_seen: null };
  const escondida = buildSnapshot(rows({ satellites: [semAtividade] }), NOW, { activityMayBeHidden: true });
  expect(escondida.satellites[0].online).toBeNull();
  expect(escondida.satellites[0].lastEventAt).toBeNull();
  // fora disso (admin) mantém-se o comportamento de sempre
  const admin = buildSnapshot(rows({ satellites: [semAtividade] }), NOW);
  expect(admin.satellites[0].online).toBe(false);
  expect(admin.satellites[0].lastEventAt).toBe(new Date(0).toISOString());
});

test("bateria do satélite vem SÓ da linha do satélite; o sinal (rssi) nunca aparece", () => {
  // Mesmo que alguém acrescente battery/rssi às linhas de eventos, a app não os usa.
  const comExtras = { node_id: "AC-RSN-1", event: "leak_detected", recorded_at: minutesAgo(3), battery: 7, rssi: -91 };
  const events: RawRows["events"] = [comExtras];
  const snap = buildSnapshot(
    rows({
      satellites: [{ device_id: "AC-RSN-1", property_id: "p1", label: "WC", capabilities: ["leak"], battery: 70, last_seen: minutesAgo(3) }],
      events
    }),
    NOW
  );
  expect(snap.satellites[0].battery).toBe(70);
  const json = JSON.stringify(snap);
  expect(json).not.toContain("rssi");
  expect(json).not.toContain("-91");
});

test("autorizações: uma expirada nunca conta como ativa (como na base de dados)", () => {
  const base = { id: "c", property_id: "p1", category: "motion" as const, reason: null, granted_at: minutesAgo(500), active: true };
  const snap = buildSnapshot(
    rows({
      consents: [
        { ...base, id: "sem-prazo", expires_at: null },
        { ...base, id: "futura", category: "sound" as const, expires_at: new Date(NOW.getTime() + 3600000).toISOString() },
        { ...base, id: "expirada", category: "doorWindow" as const, expires_at: minutesAgo(10) },
        { ...base, id: "retirada", active: false, expires_at: null }
      ]
    }),
    NOW
  );
  const ativa = Object.fromEntries(snap.consentGrants.map((g) => [g.id, g.active]));
  expect(ativa).toEqual({ "sem-prazo": true, futura: true, expirada: false, retirada: false });
});

test("o resultado só depende das linhas e de «now» (mesmos dados, mesma saída)", () => {
  const input = rows({ readings: [reading(5, { humidity: 80 }), reading(15, { voc: 300 })] });
  expect(buildSnapshot(input, NOW)).toEqual(buildSnapshot(input, NOW));
});

// ---------------------------------------------------------------------------
// Verificações estáticas da camada de dados
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const DATA_FILES = ["lib/data.ts", "lib/data-rules.ts", "lib/data-scope.ts", "lib/admin/data-scope.ts"];

test("estrutura: os eventos dos satélites só pedem node_id, event e recorded_at (nunca battery nem rssi)", () => {
  for (const file of DATA_FILES) {
    const source = read(file);
    for (const m of source.matchAll(/from\("rsn_events"\)\s*\.select\("([^"]*)"/g)) {
      expect(m[1].replace(/\s/g, ""), `${file}: colunas pedidas a rsn_events`).toBe("node_id,event,recorded_at");
    }
    expect(source, `${file}: nunca select(*) em rsn_events`).not.toMatch(/rsn_events"\)\s*\.select\(\s*(\)|"\*")/);
  }
  const dataSource = read("lib/data.ts");
  expect(dataSource.match(/from\("rsn_events"\)/g)?.length).toBe(2);
});

test("estrutura: sem cache partilhada nem variáveis de módulo com dados", () => {
  for (const file of DATA_FILES) {
    const source = read(file);
    expect(source, file).not.toContain("unstable_cache");
    expect(source, file).not.toMatch(/\brevalidate\b/);
    expect(source, file).not.toMatch(/^let\s/m); // nenhum «let» ao nível do módulo
    expect(source, file).not.toMatch(/^(export\s+)?const\s+\w+\s*=\s*new (Map|Set)\b/m);
  }
});

test("estrutura: sem dados de demonstração nem modo antigo; só leituras por sessão ou administrador", () => {
  const scope = read("lib/data-scope.ts");
  for (const file of DATA_FILES) {
    expect(read(file), file).not.toMatch(/allowDemoFallback|legacyServiceScope|from "\.\/seed"|seed[A-Z]/);
  }
  expect(scope).toContain('kind: "admin" | "session"');
  // o âmbito de sessão lê das vistas, nunca das tabelas de base
  expect(scope).toContain('readingsTable: "sensor_readings_visible"');
  expect(scope).toContain('satellitesTable: "satellites_visible"');
});

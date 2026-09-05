import {
  Alert,
  ConsentGrant,
  Hub,
  HistoryPoint,
  Insight,
  Metric,
  Property,
  RestrictedCategory,
  Satellite,
  SatelliteCapability,
  SatelliteEvent,
  Status,
  Tenant
} from "./types";
import { hashSeed, mulberry32 } from "./prng";

// ---------------------------------------------------------------------------
// Demo / seed dataset for the real Aureon Core pilot hardware: ONE Hub per
// property (onboard ambient sensors: temperature, humidity, VOC/air quality
// — installed in a single room) plus 1-3 battery-powered Satellite / Remote
// Sensor Node units (leak, motion, door/window — event-based, not
// continuous). This matches the Hub + RSN architecture agreed with Count
// Customs (Sensor Architecture doc, Jan 2026; Hub/RSN PCB testing updates,
// Jul-Aug 2026) and the device description in the Pilot Program Agreement
// ("temperatura, humidade, aberturas de portas/janelas, movimento, fuga de
// água"). Earlier versions of this dashboard modelled fake per-room
// temperature/humidity/VOC and a "smoke detector" per room — neither exists
// on the real hardware, and the Pilot Agreement explicitly states the System
// does NOT include certified smoke detection, so that was removed.
//
// Differences from the original Manus prototype, deliberately:
//   - No random "live tick" every 4s. Real hubs report on a ~10-minute
//     interval, so a fake fast jitter would misrepresent how the pilot
//     actually behaves. Data here is stable and reproducible instead.
//   - Alerts/Insights are computed from threshold rules (see buildAlerts /
//     buildInsights below) instead of hand-written strings, so they stay
//     correct as real data comes in via Supabase.
// ---------------------------------------------------------------------------

// Fixed reference "now" so server/client renders match and the chart axis is
// stable. A live Supabase-backed provider would use `new Date()`. Declared
// first: buildAlerts()/buildInsights() below call hoursAgoISO(), which reads
// this — it must be initialized before those run.
export const FIXED_NOW = new Date("2026-08-18T00:34:15.000Z");

function hoursAgoISO(hours: number): string {
  return new Date(FIXED_NOW.getTime() - hours * 3600000).toISOString();
}

export const TENANTS: Tenant[] = [
  { id: "t1", name: "Sofia Andrade", email: "sofia.andrade@email.com", propertyId: "p1" },
  { id: "t2", name: "Miguel Costa", email: "miguel.costa@email.com", propertyId: "p2" },
  { id: "t3", name: "Ana Ferreira", email: "ana.ferreira@email.com", propertyId: "p3" }
];

const RAW_PROPERTIES = [
  { id: "p1", name: "Apartamento Rua das Flores", address: "Rua das Flores, 42, 3º Esq", city: "Lisboa", hubId: "AC-HUB-0001", tenantId: "t1" },
  { id: "p2", name: "Moradia Quinta do Sol", address: "Av. Quinta do Sol, 15", city: "Cascais", hubId: "AC-HUB-0002", tenantId: "t2" },
  { id: "p3", name: "Estúdio Bairro Alto", address: "Travessa da Espera, 8, 1º", city: "Lisboa", hubId: "AC-HUB-0003", tenantId: "t3" }
];

// One Hub per property — installed in a single room, measures ambient
// conditions for the whole home from that room (mirrors the real Hub PCB's
// onboard sensors, not one sensor per room).
type RawHub = {
  id: string;
  propertyId: string;
  location: string;
  temperature: number;
  humidity: number;
  voc: number;
};

const RAW_HUBS: RawHub[] = [
  { id: "AC-HUB-0001", propertyId: "p1", location: "Sala de Estar", temperature: 22.4, humidity: 58, voc: 45 },
  { id: "AC-HUB-0002", propertyId: "p2", location: "Sala de Jantar", temperature: 25.8, humidity: 74, voc: 88 },
  { id: "AC-HUB-0003", propertyId: "p3", location: "Estúdio Principal", temperature: 22.8, humidity: 71, voc: 55 }
];

// 1-3 battery-powered Satellite / Remote Sensor Node units per property.
// The typical pilot config is one leak+motion satellite in the bathroom
// (best place to catch a leak early) plus optional door/window satellites
// elsewhere in the home.
type RawSatellite = {
  id: string;
  propertyId: string;
  label: string;
  capabilities: SatelliteCapability[];
  leakState: "normal" | "alert";
  doorWindowState: "Aberto" | "Fechado" | null;
  battery: number;
  lastEventHoursAgo: number;
};

const RAW_SATELLITES: RawSatellite[] = [
  // p1 — Apartamento Rua das Flores
  { id: "s1", propertyId: "p1", label: "Casa de Banho", capabilities: ["leak", "motion"], leakState: "normal", doorWindowState: null, battery: 88, lastEventHoursAgo: 3 },
  { id: "s2", propertyId: "p1", label: "Quarto Principal", capabilities: ["doorWindow"], leakState: "normal", doorWindowState: "Aberto", battery: 76, lastEventHoursAgo: 1.5 },

  // p2 — Moradia Quinta do Sol (active leak alert, for demo purposes)
  { id: "s3", propertyId: "p2", label: "Casa de Banho", capabilities: ["leak", "motion"], leakState: "alert", doorWindowState: null, battery: 61, lastEventHoursAgo: 23 / 60 },
  { id: "s4", propertyId: "p2", label: "Entrada", capabilities: ["doorWindow"], leakState: "normal", doorWindowState: "Fechado", battery: 92, lastEventHoursAgo: 6 },
  { id: "s5", propertyId: "p2", label: "Cave / Arrecadação", capabilities: ["motion"], leakState: "normal", doorWindowState: null, battery: 54, lastEventHoursAgo: 30 },

  // p3 — Estúdio Bairro Alto
  { id: "s6", propertyId: "p3", label: "Casa de Banho", capabilities: ["leak", "motion"], leakState: "normal", doorWindowState: null, battery: 83, lastEventHoursAgo: 5 }
];

// --- Thresholds (mirrors the original alert/insight engine) ----------------
const HUMIDITY_MOLD_RISK = 70; // %
const VOC_POOR_AIR = 120; // index
const VOC_CRITICAL = 200; // index
const TEMP_HIGH = 30; // °C
const HUMIDITY_VENTILATION_INFO = 60; // %
const TEMP_INFO = 24; // °C

function computeHubStatus(h: RawHub): Status {
  if (h.humidity > HUMIDITY_MOLD_RISK || h.temperature > TEMP_HIGH || h.voc > VOC_CRITICAL) return "atencao";
  return "normal";
}

export const HUBS: Hub[] = RAW_HUBS.map((h) => ({
  id: h.id,
  propertyId: h.propertyId,
  location: h.location,
  temperature: h.temperature,
  humidity: h.humidity,
  voc: h.voc,
  online: true,
  status: computeHubStatus(h)
}));

export const SATELLITES: Satellite[] = RAW_SATELLITES.map((s) => ({
  id: s.id,
  propertyId: s.propertyId,
  label: s.label,
  capabilities: s.capabilities,
  leakState: s.leakState,
  doorWindowState: s.doorWindowState,
  battery: s.battery,
  online: true,
  lastEventAt: hoursAgoISO(s.lastEventHoursAgo)
}));

// Privacy model: motion and door/window events are presence/behaviour data,
// not property-damage data, so by default the owner does NOT see them — only
// the tenant does. An owner only sees a restricted category for a property
// once the tenant has explicitly granted it here (e.g. for a dispute). Leak
// events are never restricted — they're a property-damage signal the owner
// always needs. p2's tenant has granted "motion" for a noise/activity
// dispute, so the demo shows both the locked default state (p1, p3) and the
// unlocked-by-consent state (p2) side by side.
export const CONSENT_GRANTS: ConsentGrant[] = [
  {
    id: "cg1",
    propertyId: "p2",
    category: "motion",
    reason: "Disputa de ruído/atividade noturna — Agosto 2026",
    grantedAt: hoursAgoISO(72),
    active: true
  }
];

export function hasConsent(propertyId: string, category: RestrictedCategory): boolean {
  return CONSENT_GRANTS.some((g) => g.propertyId === propertyId && g.category === category && g.active);
}

export const PROPERTIES: Property[] = RAW_PROPERTIES.map((p) => {
  const hub = HUBS.find((h) => h.propertyId === p.id)!;
  const anyLeak = SATELLITES.some((s) => s.propertyId === p.id && s.leakState === "alert");
  const status: Status = anyLeak ? "critico" : hub.status === "atencao" ? "atencao" : "normal";
  return { ...p, status, hubOnline: hub.online };
});

// --- Alerts (event-style, one per triggering condition) --------------------
function buildAlerts(): Alert[] {
  const alerts: Alert[] = [];
  let n = 1;

  for (const property of RAW_PROPERTIES) {
    const hub = RAW_HUBS.find((h) => h.propertyId === property.id)!;
    const satellites = RAW_SATELLITES.filter((s) => s.propertyId === property.id);

    for (const sat of satellites) {
      if (sat.leakState === "alert") {
        alerts.push({
          id: `a${n++}`,
          propertyId: property.id,
          deviceLabel: sat.label,
          title: "Fuga de Água Detetada",
          message: `Fuga de água detetada pelo satélite "${sat.label}" — ${property.name}. Fechar torneira principal e verificar tubagens.`,
          severity: "critico",
          tag: "Fuga de Água",
          createdAt: hoursAgoISO(sat.lastEventHoursAgo),
          active: true
        });
      }
    }

    if (hub.humidity > HUMIDITY_MOLD_RISK) {
      alerts.push({
        id: `a${n++}`,
        propertyId: property.id,
        deviceLabel: hub.location,
        title: "Risco de Bolor Detetado",
        message: `Humidade elevada (${hub.humidity}%) há 48h, medida pelo hub em ${hub.location}.`,
        severity: "aviso",
        tag: "Risco de Bolor",
        createdAt: hoursAgoISO(48),
        active: true
      });
    }

    if (hub.voc > VOC_POOR_AIR) {
      alerts.push({
        id: `a${n++}`,
        propertyId: property.id,
        deviceLabel: hub.location,
        title: "Qualidade do Ar Degradada",
        message: `Qualidade do ar degradada (VOC ${hub.voc}), medida pelo hub em ${hub.location}.`,
        severity: hub.voc > VOC_CRITICAL ? "critico" : "aviso",
        tag: "Qualidade do Ar",
        createdAt: hoursAgoISO(6),
        active: true
      });
    }
  }

  return alerts;
}

// --- Insights (property-level narrative + recommendation) ------------------
function buildInsights(): Insight[] {
  const insights: Insight[] = [];
  let n = 1;

  for (const property of RAW_PROPERTIES) {
    const hub = RAW_HUBS.find((h) => h.propertyId === property.id)!;

    if (hub.humidity > HUMIDITY_MOLD_RISK) {
      insights.push({
        id: `i${n++}`,
        propertyId: property.id,
        deviceLabel: hub.location,
        title: "Risco de Bolor Detetado",
        message: `Humidade elevada (${hub.humidity}%) há 48h, medida pelo hub em ${hub.location}.`,
        severity: "aviso",
        recommendation: "Ventilar regularmente. Verificar isolamento e presença de bolores nas paredes.",
        tag: "Risco de Bolor",
        createdAt: hoursAgoISO(48)
      });
    }

    if (hub.humidity > HUMIDITY_VENTILATION_INFO) {
      insights.push({
        id: `i${n++}`,
        propertyId: property.id,
        deviceLabel: hub.location,
        title: "Ventilação Recomendada",
        message: `A humidade medida pelo hub (${hub.humidity}%) está acima do ideal (40–60%).`,
        severity: "informativo",
        recommendation: "Abrir janelas 15–20 minutos pela manhã. Considerar desumidificador.",
        tag: "Informativo",
        createdAt: hoursAgoISO(12)
      });
    }

    if (hub.temperature > TEMP_INFO) {
      insights.push({
        id: `i${n++}`,
        propertyId: property.id,
        deviceLabel: hub.location,
        title: "Temperatura Acima do Normal",
        message: `Temperatura de ${hub.temperature}°C. Valores acima de ${TEMP_INFO}°C podem indicar má ventilação.`,
        severity: "informativo",
        recommendation: "Verificar ventilação e sombreamento. Considerar regulação de aquecimento.",
        tag: "Informativo",
        createdAt: hoursAgoISO(3)
      });
    }

    if (hub.voc > VOC_POOR_AIR) {
      insights.push({
        id: `i${n++}`,
        propertyId: property.id,
        deviceLabel: hub.location,
        title: "Qualidade do Ar Comprometida",
        message: `Índice VOC elevado (${hub.voc}) em ${hub.location}. Possíveis fontes: produtos de limpeza, tintas, mobiliário novo.`,
        severity: hub.voc > VOC_CRITICAL ? "critico" : "aviso",
        recommendation: "Aumentar ventilação. Identificar e remover fontes de compostos orgânicos voláteis.",
        tag: "Qualidade do Ar",
        createdAt: hoursAgoISO(6)
      });
    }
  }

  return insights;
}

export const ALERTS: Alert[] = buildAlerts();
export const INSIGHTS: Insight[] = buildInsights();

const IDEAL_RANGE: Record<Metric, [number, number]> = {
  temperature: [19, 24],
  humidity: [40, 60],
  voc: [0, 60]
};

export function idealRangeLabel(metric: Metric): string {
  const [lo, hi] = IDEAL_RANGE[metric];
  if (metric === "temperature") return `Ideal: ${lo}–${hi}°C`;
  if (metric === "humidity") return `Ideal: ${lo}–${hi}%`;
  return `Ideal: <${hi}`;
}

// Deterministic hourly ambient history for a property's Hub over N days,
// trending toward the Hub's current reading so the "last point" always
// matches HUBS above.
export function generateHistory(propertyId: string, days: number): HistoryPoint[] {
  const hub = HUBS.find((h) => h.propertyId === propertyId);
  if (!hub) return [];
  const rand = mulberry32(hashSeed(hub.id));
  const points: HistoryPoint[] = [];
  const hours = days * 24;
  const startTemp = hub.temperature - (rand() * 2 - 1) * 3;
  const startHum = Math.max(35, hub.humidity - (rand() * 10 + 6));
  const startVoc = Math.max(20, hub.voc - (rand() * 20 + 10));

  for (let i = hours; i >= 0; i--) {
    const t = 1 - i / hours; // 0 -> 1 across the window
    const diurnal = Math.sin(((i % 24) / 24) * Math.PI * 2);
    const noise = () => rand() - 0.5;

    const temperature = round1(startTemp + (hub.temperature - startTemp) * t + diurnal * 0.6 + noise() * 0.4);
    const humidity = round1(clamp(startHum + (hub.humidity - startHum) * t - diurnal * 2 + noise() * 1.5, 20, 98));
    const voc = Math.round(clamp(startVoc + (hub.voc - startVoc) * t + diurnal * 4 + noise() * 6, 10, 220));

    const ts = new Date(FIXED_NOW.getTime() - i * 3600000);
    points.push({ timestamp: ts.toISOString(), temperature, humidity, voc });
  }
  return points;
}

// Deterministic event log for a property's satellites over N days — motion
// and door/window satellites fire more often than a leak-only satellite,
// which should ideally almost never fire.
export function generateSatelliteEvents(propertyId: string, days: number): SatelliteEvent[] {
  const satellites = SATELLITES.filter((s) => s.propertyId === propertyId);
  const events: SatelliteEvent[] = [];

  for (const sat of satellites) {
    const rand = mulberry32(hashSeed(sat.id + "-events"));
    const perDay = sat.capabilities.includes("motion") ? 3 : sat.capabilities.includes("doorWindow") ? 1.5 : 0.2;
    const count = Math.max(2, Math.round(days * perDay));

    for (let i = 0; i < count; i++) {
      const hoursAgo = 1 + rand() * (days * 24 - 1);
      const type = sat.capabilities[Math.floor(rand() * sat.capabilities.length)];
      events.push({
        id: `${sat.id}-e${i}`,
        propertyId,
        satelliteId: sat.id,
        satelliteLabel: sat.label,
        type,
        timestamp: new Date(FIXED_NOW.getTime() - hoursAgo * 3600000).toISOString()
      });
    }

    // Always include the satellite's real "last event" (e.g. the active leak).
    events.push({
      id: `${sat.id}-last`,
      propertyId,
      satelliteId: sat.id,
      satelliteLabel: sat.label,
      type: sat.leakState === "alert" ? "leak" : sat.capabilities[0],
      timestamp: sat.lastEventAt
    });
  }

  return events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

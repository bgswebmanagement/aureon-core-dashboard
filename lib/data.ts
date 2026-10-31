import { cache } from "react";
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
import {
  ALERTS,
  CONSENT_GRANTS,
  generateHistory as seedGenerateHistory,
  generateSatelliteEvents as seedGenerateSatelliteEvents,
  hasConsent as seedHasConsent,
  HUBS,
  INSIGHTS,
  PROPERTIES,
  SATELLITES,
  TENANTS
} from "./seed";
import { getSupabaseServiceClient } from "./supabase";
import { averageOrNull } from "./readings";

// ---------------------------------------------------------------------------
// Single data-access surface used by every page/component.
//
// Reads from the deterministic seed dataset (lib/seed.ts) until Supabase is
// configured. Once NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// set (see supabase/schema.sql + README.md), every function below switches to
// real Supabase queries automatically — no component needs to change.
//
// IMPORTANT: this reads with the *service role* client (bypasses Row Level
// Security), not the anon client — because Supabase Auth isn't wired up yet
// (see README "Known gaps"), so there is no logged-in user for RLS policies
// to scope access to. That's fine for the pilot (nobody outside Aureon Core
// hits these server-only functions), but MUST be revisited once tenant/owner
// login exists: at that point owner/tenant pages should read with the anon
// client under a real session, and only /admin should keep the service
// client (matching its documented "unrestricted, same as Table Editor"
// access level). Tracked in README "Known gaps".
// ---------------------------------------------------------------------------

export const isLiveMode =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// --- Thresholds (mirrors lib/seed.ts so live and demo data behave the same) -
const HUMIDITY_MOLD_RISK = 70; // %
const VOC_POOR_AIR = 120; // index
const VOC_CRITICAL = 200; // index
const TEMP_HIGH = 30; // °C
const HUMIDITY_VENTILATION_INFO = 60; // %
const TEMP_INFO = 24; // °C
const LOW_BATTERY_THRESHOLD = 30; // %
const HUB_ONLINE_MINUTES = 30; // hub reports ~every 10 min
const SATELLITE_ONLINE_HOURS = 48; // satellites are event-driven, not continuous

const VOC_FALLBACK_MINUTES = 30; // card shows the last valid VOC from this window if the latest reading has none
const VOC_CONSECUTIVE_READINGS = 3; // a VOC alert needs this many consecutive valid readings above the limit

type VocLevel = "aviso" | "critico";

// Missing values (null) are ignored — they never count as "above" anything.
function computeHubStatus(temperature: number | null, humidity: number | null, sustainedVoc: VocLevel | null): Status {
  if (
    (humidity != null && humidity > HUMIDITY_MOLD_RISK) ||
    (temperature != null && temperature > TEMP_HIGH) ||
    sustainedVoc === "critico"
  ) {
    return "atencao";
  }
  return "normal";
}

// `recentValid` = a hub's valid (non-null) VOC readings, newest first. The VOC
// index is relative to the location, so a single high reading is not enough:
// all of the last N valid readings must be above the limit. The level is set
// by the lowest of them (all must clear the critical limit to be "critico").
function sustainedVocLevel(recentValid: { voc: number }[]): VocLevel | null {
  if (recentValid.length < VOC_CONSECUTIVE_READINGS) return null;
  const lowest = Math.min(...recentValid.slice(0, VOC_CONSECUTIVE_READINGS).map((r) => r.voc));
  if (lowest > VOC_CRITICAL) return "critico";
  if (lowest > VOC_POOR_AIR) return "aviso";
  return null;
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

// Map a raw rsn_events.event string to the app's SatelliteCapability type.
function eventToCapability(event: string): SatelliteCapability | null {
  if (event === "leak_detected") return "leak";
  if (event === "motion_detected") return "motion";
  if (event === "door_open" || event === "door_closed") return "doorWindow";
  return null;
}

// --- Live snapshot: one set of round trips per request, cached with React's
// cache() so multiple functions calling this within the same server render
// don't each re-query Supabase. -------------------------------------------

type LiveSnapshot = {
  properties: Property[];
  hubs: Hub[];
  satellites: Satellite[];
  tenants: Tenant[];
  alerts: Alert[];
  insights: Insight[];
  consentGrants: ConsentGrant[];
};

const getLiveSnapshot = cache(async (): Promise<LiveSnapshot | null> => {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;

  try {
    const [
      { data: propertyRows },
      { data: hubRows },
      { data: satelliteRows },
      { data: tenantRows },
      { data: readingRows },
      { data: eventRows },
      { data: consentRows }
    ] = await Promise.all([
      supabase.from("properties").select("id, name, address, city"),
      supabase.from("hubs").select("id, device_id, property_id, location, last_seen"),
      supabase.from("satellites").select("id, device_id, hub_id, property_id, label, capabilities, battery, last_seen"),
      supabase.from("tenants").select("id, property_id, name, email"),
      supabase
        .from("sensor_readings")
        .select("hub_id, temperature, humidity, voc, sound_dbfs, recorded_at")
        .order("recorded_at", { ascending: false })
        .limit(1000),
      supabase
        .from("rsn_events")
        .select("node_id, event, recorded_at")
        .order("recorded_at", { ascending: false })
        .limit(1000),
      supabase.from("consent_grants").select("id, property_id, category, reason, granted_at, expires_at, active")
    ]);

    // Latest sensor_reading per hub (rows already newest-first).
    const latestReadingByHub = new Map<string, { temperature: number | null; humidity: number | null; voc: number | null; sound_dbfs: number | null; recorded_at: string }>();
    for (const r of readingRows ?? []) {
      if (!latestReadingByHub.has(r.hub_id)) latestReadingByHub.set(r.hub_id, r);
    }

    // Most recent valid (non-null) VOC readings per hub, newest first. The
    // firmware omits `voc` while the sensor warms up, so the latest reading
    // may have none.
    const recentVocByHub = new Map<string, { voc: number; recorded_at: string }[]>();
    for (const r of readingRows ?? []) {
      if (r.voc == null) continue;
      const list = recentVocByHub.get(r.hub_id) ?? [];
      if (list.length < VOC_CONSECUTIVE_READINGS) {
        list.push({ voc: r.voc, recorded_at: r.recorded_at });
        recentVocByHub.set(r.hub_id, list);
      }
    }

    // Latest rsn_event per satellite device_id (rows already newest-first).
    const latestEventByNode = new Map<string, { event: string; recorded_at: string }>();
    for (const e of eventRows ?? []) {
      if (!latestEventByNode.has(e.node_id)) latestEventByNode.set(e.node_id, e);
    }

    // The app's model assumes one Hub per property, but nothing in the
    // schema enforces that — if a property ever ends up with more than one
    // hub row (e.g. a leftover from an earlier provisioning attempt), keep
    // only the one that actually has data (most recent last_seen) instead
    // of whichever one the database happened to return first. This
    // deduplication happens BEFORE building the `Hub[]` the rest of the app
    // sees, so every function (getHub, getFleetHealth, getOverviewStats,
    // alerts, the property cards, ...) automatically gets the right one —
    // there's no separate raw list anyone could accidentally read from.
    const bestHubRowByProperty = new Map<string, NonNullable<typeof hubRows>[number]>();
    for (const h of hubRows ?? []) {
      const existing = bestHubRowByProperty.get(h.property_id);
      if (!existing) {
        bestHubRowByProperty.set(h.property_id, h);
        continue;
      }
      const existingSeen = existing.last_seen ? new Date(existing.last_seen).getTime() : 0;
      const currentSeen = h.last_seen ? new Date(h.last_seen).getTime() : 0;
      if (currentSeen > existingSeen) bestHubRowByProperty.set(h.property_id, h);
    }

    const sustainedVocByProperty = new Map<string, { level: VocLevel; value: number; recordedAt: string }>();

    const hubs: Hub[] = Array.from(bestHubRowByProperty.values()).map((h) => {
      const reading = latestReadingByHub.get(h.id);
      const temperature = reading?.temperature ?? null;
      const humidity = reading?.humidity ?? null;
      const recentVoc = recentVocByHub.get(h.id) ?? [];
      const lastValidVoc = recentVoc[0];
      // Latest VOC if present; otherwise the last valid one from the past 30
      // minutes; otherwise null (sensor warming up) — never 0.
      const voc =
        reading?.voc ??
        (lastValidVoc && (minutesSince(lastValidVoc.recorded_at) ?? Infinity) <= VOC_FALLBACK_MINUTES ? lastValidVoc.voc : null);
      const vocLevel = sustainedVocLevel(recentVoc);
      if (vocLevel) sustainedVocByProperty.set(h.property_id, { level: vocLevel, value: lastValidVoc.voc, recordedAt: lastValidVoc.recorded_at });
      const mins = minutesSince(h.last_seen);
      return {
        id: h.device_id,
        propertyId: h.property_id,
        location: h.location ?? "",
        temperature,
        humidity,
        voc,
        sound_dbfs: reading?.sound_dbfs ?? null,
        online: mins !== null && mins <= HUB_ONLINE_MINUTES,
        status: computeHubStatus(temperature, humidity, vocLevel)
      };
    });
    const hubByPropertyId = new Map(hubs.map((h) => [h.propertyId, h]));
    // When was that hub's latest reading actually recorded — used so alerts
    // show the real measurement time instead of "now" (the render time).
    const readingRecordedAtByProperty = new Map<string, string>();
    for (const h of bestHubRowByProperty.values()) {
      const reading = latestReadingByHub.get(h.id);
      if (reading) readingRecordedAtByProperty.set(h.property_id, reading.recorded_at);
    }

    const satellites: Satellite[] = (satelliteRows ?? []).map((s) => {
      const latestEvent = latestEventByNode.get(s.device_id);
      const capabilities = (s.capabilities ?? []) as SatelliteCapability[];
      const leakState: "normal" | "alert" =
        capabilities.includes("leak") && latestEvent?.event === "leak_detected" ? "alert" : "normal";
      let doorWindowState: "Aberto" | "Fechado" | null = null;
      if (capabilities.includes("doorWindow")) {
        if (latestEvent?.event === "door_open") doorWindowState = "Aberto";
        else if (latestEvent?.event === "door_closed") doorWindowState = "Fechado";
      }
      const mins = minutesSince(s.last_seen);
      return {
        id: s.device_id,
        propertyId: s.property_id,
        label: s.label,
        capabilities,
        leakState,
        doorWindowState,
        battery: s.battery ?? 100,
        online: mins !== null && mins <= SATELLITE_ONLINE_HOURS * 60,
        lastEventAt: latestEvent?.recorded_at ?? s.last_seen ?? new Date(0).toISOString()
      };
    });
    const satellitesByProperty = new Map<string, Satellite[]>();
    for (const s of satellites) {
      const list = satellitesByProperty.get(s.propertyId) ?? [];
      list.push(s);
      satellitesByProperty.set(s.propertyId, list);
    }

    const tenants: Tenant[] = (tenantRows ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      propertyId: t.property_id
    }));
    const tenantByProperty = new Map(tenants.map((t) => [t.propertyId, t]));

    const properties: Property[] = (propertyRows ?? []).map((p) => {
      const hub = hubByPropertyId.get(p.id);
      const propSatellites = satellitesByProperty.get(p.id) ?? [];
      const anyLeak = propSatellites.some((s) => s.leakState === "alert");
      const status: Status = anyLeak ? "critico" : hub?.status === "atencao" ? "atencao" : "normal";
      return {
        id: p.id,
        name: p.name,
        address: p.address,
        city: p.city,
        status,
        hubId: hub?.id ?? "",
        hubOnline: hub?.online ?? false,
        tenantId: tenantByProperty.get(p.id)?.id
      };
    });

    const consentGrants: ConsentGrant[] = (consentRows ?? []).map((c) => ({
      id: c.id,
      propertyId: c.property_id,
      category: c.category,
      reason: c.reason ?? undefined,
      grantedAt: c.granted_at,
      expiresAt: c.expires_at ?? undefined,
      active: c.active
    }));

    // Alerts/insights, computed the same way lib/seed.ts does it, but from
    // live hub/satellite state instead of the fixed demo dataset.
    const alerts: Alert[] = [];
    const insights: Insight[] = [];
    let alertN = 1;
    let insightN = 1;

    for (const property of properties) {
      const hub = hubByPropertyId.get(property.id);
      const propSatellites = satellitesByProperty.get(property.id) ?? [];

      for (const sat of propSatellites) {
        if (sat.leakState === "alert") {
          alerts.push({
            id: `live-a${alertN++}`,
            propertyId: property.id,
            deviceLabel: sat.label,
            title: "Fuga de Água Detetada",
            message: `Fuga de água detetada pelo satélite "${sat.label}" — ${property.name}. Fechar torneira principal e verificar tubagens.`,
            severity: "critico",
            tag: "Fuga de Água",
            createdAt: sat.lastEventAt,
            active: true
          });
        }
      }

      if (hub) {
        // Real time the hub's latest reading was recorded — not "now" (the
        // page render time), so alerts/insights show when the condition was
        // actually observed instead of always looking freshly-just-happened.
        const readingAt = readingRecordedAtByProperty.get(property.id) ?? new Date().toISOString();

        // Missing readings (null) never trigger alerts or insights.
        const { humidity, temperature } = hub;

        if (humidity != null && humidity > HUMIDITY_MOLD_RISK) {
          alerts.push({
            id: `live-a${alertN++}`,
            propertyId: property.id,
            deviceLabel: hub.location,
            title: "Risco de Bolor Detetado",
            message: `Humidade elevada (${humidity}%), medida pelo hub em ${hub.location}.`,
            severity: "aviso",
            tag: "Risco de Bolor",
            createdAt: readingAt,
            active: true
          });
          insights.push({
            id: `live-i${insightN++}`,
            propertyId: property.id,
            deviceLabel: hub.location,
            title: "Risco de Bolor Detetado",
            message: `Humidade elevada (${humidity}%), medida pelo hub em ${hub.location}.`,
            severity: "aviso",
            recommendation: "Ventilar regularmente. Verificar isolamento e presença de bolores nas paredes.",
            tag: "Risco de Bolor",
            createdAt: readingAt
          });
        } else if (humidity != null && humidity > HUMIDITY_VENTILATION_INFO) {
          insights.push({
            id: `live-i${insightN++}`,
            propertyId: property.id,
            deviceLabel: hub.location,
            title: "Ventilação Recomendada",
            message: `A humidade medida pelo hub (${humidity}%) está acima do ideal (40–60%).`,
            severity: "informativo",
            recommendation: "Abrir janelas 15–20 minutos pela manhã. Considerar desumidificador.",
            tag: "Informativo",
            createdAt: readingAt
          });
        }

        if (temperature != null && temperature > TEMP_INFO) {
          insights.push({
            id: `live-i${insightN++}`,
            propertyId: property.id,
            deviceLabel: hub.location,
            title: "Temperatura Acima do Normal",
            message: `Temperatura de ${temperature}°C. Valores acima de ${TEMP_INFO}°C podem indicar má ventilação.`,
            severity: "informativo",
            recommendation: "Verificar ventilação e sombreamento. Considerar regulação de aquecimento.",
            tag: "Informativo",
            createdAt: readingAt
          });
        }

        // VOC: only after 3 consecutive valid readings above the limit — a
        // single high reading, or missing ones, never raise an alert.
        const sustainedVoc = sustainedVocByProperty.get(property.id);
        if (sustainedVoc) {
          const severity = sustainedVoc.level;
          alerts.push({
            id: `live-a${alertN++}`,
            propertyId: property.id,
            deviceLabel: hub.location,
            title: "Nível de VOC Acima do Habitual",
            message: `Nível de VOC acima do habitual (VOC ${sustainedVoc.value}) em ${VOC_CONSECUTIVE_READINGS} leituras consecutivas, medido pelo hub em ${hub.location}.`,
            severity,
            tag: "Nível de VOC",
            createdAt: sustainedVoc.recordedAt,
            active: true
          });
          insights.push({
            id: `live-i${insightN++}`,
            propertyId: property.id,
            deviceLabel: hub.location,
            title: "Nível de VOC Acima do Habitual",
            message: `Índice VOC elevado (${sustainedVoc.value}) em ${hub.location}, acima do habitual para este local. Possíveis fontes: produtos de limpeza, tintas, mobiliário novo.`,
            severity,
            recommendation: "Aumentar ventilação. Identificar e remover fontes de compostos orgânicos voláteis.",
            tag: "Nível de VOC",
            createdAt: sustainedVoc.recordedAt
          });
        }
      }
    }

    return { properties, hubs, satellites, tenants, alerts, insights, consentGrants };
  } catch (err) {
    console.error("[data] failed to read live Supabase snapshot, falling back to demo data:", err);
    return null;
  }
});

// ---------------------------------------------------------------------------

export async function getProperties(): Promise<Property[]> {
  const live = await getLiveSnapshot();
  return live ? live.properties : PROPERTIES;
}

export async function getProperty(id: string): Promise<Property | undefined> {
  const properties = await getProperties();
  return properties.find((p) => p.id === id);
}

// One Hub per property.
export async function getHub(propertyId: string): Promise<Hub | undefined> {
  const live = await getLiveSnapshot();
  const hubs = live ? live.hubs : HUBS;
  return hubs.find((h) => h.propertyId === propertyId);
}

export async function getSatellites(propertyId?: string): Promise<Satellite[]> {
  const live = await getLiveSnapshot();
  const satellites = live ? live.satellites : SATELLITES;
  return propertyId ? satellites.filter((s) => s.propertyId === propertyId) : satellites;
}

export async function getTenants(): Promise<Tenant[]> {
  const live = await getLiveSnapshot();
  return live ? live.tenants : TENANTS;
}

export async function getTenant(id: string): Promise<Tenant | undefined> {
  const tenants = await getTenants();
  return tenants.find((t) => t.id === id);
}

export async function getTenantByProperty(propertyId: string): Promise<Tenant | undefined> {
  const tenants = await getTenants();
  return tenants.find((t) => t.propertyId === propertyId);
}

export async function getAlerts(propertyId?: string): Promise<Alert[]> {
  const live = await getLiveSnapshot();
  const list = live ? live.alerts : propertyId ? ALERTS.filter((a) => a.propertyId === propertyId) : ALERTS;
  const filtered = live && propertyId ? list.filter((a) => a.propertyId === propertyId) : list;
  return [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getInsights(propertyId?: string): Promise<Insight[]> {
  const live = await getLiveSnapshot();
  const list = live ? live.insights : propertyId ? INSIGHTS.filter((i) => i.propertyId === propertyId) : INSIGHTS;
  const filtered = live && propertyId ? list.filter((i) => i.propertyId === propertyId) : list;
  return [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Ambient history for a property's Hub (one series per property — there is
// only one Hub per property).
export async function getHistory(propertyId: string, days: number): Promise<HistoryPoint[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return seedGenerateHistory(propertyId, days);

  try {
    const live = await getLiveSnapshot();
    const hub = live?.hubs.find((h) => h.propertyId === propertyId);
    if (!hub) return [];

    const cutoff = new Date(Date.now() - days * 24 * 3600000).toISOString();
    const { data } = await supabase
      .from("sensor_readings")
      .select("hub_id, temperature, humidity, voc, sound_dbfs, sound_max_dbfs, sound_loud_seconds, recorded_at")
      .eq("property_id", propertyId)
      .gte("recorded_at", cutoff)
      .order("recorded_at", { ascending: true });

    return (data ?? []).map((r) => ({
      timestamp: r.recorded_at,
      temperature: r.temperature ?? null,
      humidity: r.humidity ?? null,
      voc: r.voc ?? null,
      sound_dbfs: r.sound_dbfs ?? null,
      sound_max_dbfs: r.sound_max_dbfs ?? null,
      sound_loud_seconds: r.sound_loud_seconds ?? null
    }));
  } catch (err) {
    console.error("[data] getHistory live query failed, falling back to demo data:", err);
    return seedGenerateHistory(propertyId, days);
  }
}

// Event log for a property's satellites (leak/motion/door-window events).
export async function getSatelliteEvents(propertyId: string, days: number): Promise<SatelliteEvent[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return seedGenerateSatelliteEvents(propertyId, days);

  try {
    const live = await getLiveSnapshot();
    if (!live) return [];
    const satellitesById = new Map(live.satellites.map((s) => [s.id, s]));

    const cutoff = new Date(Date.now() - days * 24 * 3600000).toISOString();
    const { data } = await supabase
      .from("rsn_events")
      .select("node_id, event, recorded_at")
      .eq("property_id", propertyId)
      .gte("recorded_at", cutoff)
      .order("recorded_at", { ascending: false });

    const events: SatelliteEvent[] = [];
    for (const e of data ?? []) {
      const type = eventToCapability(e.event);
      if (!type) continue;
      const satellite = satellitesById.get(e.node_id);
      events.push({
        id: `${e.node_id}-${e.recorded_at}`,
        propertyId,
        satelliteId: e.node_id,
        satelliteLabel: satellite?.label ?? e.node_id,
        type,
        timestamp: e.recorded_at
      });
    }
    return events;
  } catch (err) {
    console.error("[data] getSatelliteEvents live query failed, falling back to demo data:", err);
    return seedGenerateSatelliteEvents(propertyId, days);
  }
}

// Tenant-controlled authorizations for the owner to see restricted (presence/
// behaviour) satellite data categories for their property. See lib/consent.ts
// for how these gate what an owner-viewer actually sees.
export async function getConsentGrants(propertyId?: string): Promise<ConsentGrant[]> {
  const live = await getLiveSnapshot();
  const grants = live ? live.consentGrants : CONSENT_GRANTS;
  return propertyId ? grants.filter((g) => g.propertyId === propertyId) : grants;
}

export async function hasConsent(propertyId: string, category: RestrictedCategory): Promise<boolean> {
  const live = await getLiveSnapshot();
  if (!live) return seedHasConsent(propertyId, category);
  return live.consentGrants.some((g) => g.propertyId === propertyId && g.category === category && g.active);
}

export async function getOverviewStats() {
  const live = await getLiveSnapshot();
  const properties = live ? live.properties : PROPERTIES;
  const hubs = live ? live.hubs : HUBS;
  const satellites = live ? live.satellites : SATELLITES;
  const alerts = live ? live.alerts : ALERTS;

  // Hubs without a value (null) are left out of the average, not counted as 0.
  const avgTemp = averageOrNull(hubs.map((h) => h.temperature));
  const avgHum = averageOrNull(hubs.map((h) => h.humidity));
  const avgVoc = averageOrNull(hubs.map((h) => h.voc));
  const withAlerts = properties.filter((p) => p.status !== "normal").length;
  const criticalAlerts = alerts.filter((a) => a.severity === "critico" && a.active).length;

  return {
    totalProperties: properties.length,
    totalHubs: hubs.length,
    totalSatellites: satellites.length,
    propertiesWithAlerts: withAlerts,
    propertiesNormal: properties.length - withAlerts,
    avgTemp: avgTemp == null ? null : round1(avgTemp),
    avgHumidity: avgHum == null ? null : round1(avgHum),
    avgVoc: avgVoc == null ? null : Math.round(avgVoc),
    criticalAlerts
  };
}

// Fleet-health numbers for the Aureon Core admin view — devices that need
// physical attention (low battery, offline), regardless of which owner
// account they belong to.
export async function getFleetHealth() {
  const live = await getLiveSnapshot();
  const hubs = live ? live.hubs : HUBS;
  const satellites = live ? live.satellites : SATELLITES;

  const hubsOffline = hubs.filter((h) => !h.online).length;
  const satellitesOffline = satellites.filter((s) => !s.online).length;
  const satellitesLowBattery = satellites.filter((s) => s.battery < LOW_BATTERY_THRESHOLD).length;

  return {
    totalHubs: hubs.length,
    hubsOffline,
    totalSatellites: satellites.length,
    satellitesOffline,
    satellitesLowBattery
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

import { cache } from "react";
import {
  Alert,
  ConsentGrant,
  Hub,
  HistoryPoint,
  Insight,
  Property,
  RestrictedCategory,
  Satellite,
  SatelliteEvent,
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
import { averageOrNull } from "./readings";
import { buildSnapshot, eventToCapability, LOW_BATTERY_THRESHOLD, type RawRows, type Snapshot } from "./data-rules";
import { DataUnavailableError, legacyServiceScope, type DataScope } from "./data-scope";

// ---------------------------------------------------------------------------
// Camada de dados da aplicação, em três partes:
//
//   lib/data-rules.ts  — regras puras (limites, alertas, conselhos). Recebe
//                        linhas em bruto e devolve o que se mostra.
//   lib/data-scope.ts  — COM QUE IDENTIDADE se lê (administrador, sessão da
//                        pessoa, ou o modo antigo "legacy").
//   este ficheiro      — lê as linhas através de um âmbito e aplica as regras.
//
// `createDataReader(scope)` devolve as funções de leitura para UM âmbito. O
// instantâneo (uma ronda de pedidos) fica guardado dentro desse leitor, que
// vive só durante o pedido: nunca há dados numa variável do módulo, por isso
// nada se partilha entre utilizadores.
//
// As funções exportadas no fim (getProperties, getHub, …) são o modo ANTIGO,
// com o âmbito "legacy" (chave de administração, sem login, com dados de
// demonstração se falhar). Hoje só /admin, /inquilino e /report/[id] as
// usam; as páginas do dono passam a usar um leitor com a sessão do dono.
// ---------------------------------------------------------------------------

export const isLiveMode =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// Uma ronda de pedidos às tabelas. Com o âmbito "legacy" os erros de cada
// pedido são ignorados (como sempre foi); com os outros âmbitos qualquer erro
// é uma falha clara — uma regra da base de dados a recusar NUNCA pode passar
// por "não há dados".
async function loadSnapshot(scope: DataScope): Promise<Snapshot | null> {
  const db = scope.db;
  if (!db) {
    if (scope.allowDemoFallback) return null;
    throw new DataUnavailableError("sem ligação à base de dados");
  }

  try {
    const results = await Promise.all([
      db.from("properties").select("id, name, address, city"),
      db.from("hubs").select("id, device_id, property_id, location, last_seen"),
      db.from(scope.satellitesTable).select("id, device_id, hub_id, property_id, label, capabilities, battery, last_seen"),
      db.from("tenants").select("id, property_id, name, email"),
      db
        .from(scope.readingsTable)
        .select("hub_id, temperature, humidity, voc, sound_dbfs, recorded_at")
        .order("recorded_at", { ascending: false })
        .limit(1000),
      // Eventos: SÓ estas três colunas. Nunca `battery` nem `rssi`.
      db.from("rsn_events").select("node_id, event, recorded_at").order("recorded_at", { ascending: false }).limit(1000),
      db.from("consent_grants").select("id, property_id, category, reason, granted_at, expires_at, active")
    ]);

    if (!scope.allowDemoFallback) {
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new DataUnavailableError(failed.error.message);
    }

    const [properties, hubs, satellites, tenants, readings, events, consents] = results;
    const raw: RawRows = {
      properties: properties.data ?? [],
      hubs: hubs.data ?? [],
      satellites: satellites.data ?? [],
      tenants: tenants.data ?? [],
      readings: readings.data ?? [],
      events: events.data ?? [],
      consents: consents.data ?? []
    };
    return buildSnapshot(raw, new Date(), { activityMayBeHidden: scope.kind === "session" });
  } catch (err) {
    if (scope.allowDemoFallback) {
      console.error("[data] failed to read live Supabase snapshot, falling back to demo data:", err);
      return null;
    }
    console.error("[data] leitura falhou:", err);
    throw err instanceof DataUnavailableError ? err : new DataUnavailableError("falha na leitura");
  }
}

export function createDataReader(scope: DataScope) {
  // Um instantâneo por leitor (ou seja, por pedido).
  let snapshotPromise: Promise<Snapshot | null> | undefined;
  const getLiveSnapshot = () => (snapshotPromise ??= loadSnapshot(scope));

  async function getProperties(): Promise<Property[]> {
    const live = await getLiveSnapshot();
    return live ? live.properties : PROPERTIES;
  }

  async function getProperty(id: string): Promise<Property | undefined> {
    const properties = await getProperties();
    return properties.find((p) => p.id === id);
  }

  // Um Hub por casa.
  async function getHub(propertyId: string): Promise<Hub | undefined> {
    const live = await getLiveSnapshot();
    const hubs = live ? live.hubs : HUBS;
    return hubs.find((h) => h.propertyId === propertyId);
  }

  async function getSatellites(propertyId?: string): Promise<Satellite[]> {
    const live = await getLiveSnapshot();
    const satellites = live ? live.satellites : SATELLITES;
    return propertyId ? satellites.filter((s) => s.propertyId === propertyId) : satellites;
  }

  async function getTenants(): Promise<Tenant[]> {
    const live = await getLiveSnapshot();
    return live ? live.tenants : TENANTS;
  }

  async function getTenant(id: string): Promise<Tenant | undefined> {
    const tenants = await getTenants();
    return tenants.find((t) => t.id === id);
  }

  async function getTenantByProperty(propertyId: string): Promise<Tenant | undefined> {
    const tenants = await getTenants();
    return tenants.find((t) => t.propertyId === propertyId);
  }

  async function getAlerts(propertyId?: string): Promise<Alert[]> {
    const live = await getLiveSnapshot();
    const list = live ? live.alerts : propertyId ? ALERTS.filter((a) => a.propertyId === propertyId) : ALERTS;
    const filtered = live && propertyId ? list.filter((a) => a.propertyId === propertyId) : list;
    return [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async function getInsights(propertyId?: string): Promise<Insight[]> {
    const live = await getLiveSnapshot();
    const list = live ? live.insights : propertyId ? INSIGHTS.filter((i) => i.propertyId === propertyId) : INSIGHTS;
    const filtered = live && propertyId ? list.filter((i) => i.propertyId === propertyId) : list;
    return [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // Histórico ambiente do Hub de uma casa (uma série por casa — só há um Hub
  // por casa).
  async function getHistory(propertyId: string, days: number): Promise<HistoryPoint[]> {
    const db = scope.db;
    if (!db) {
      if (scope.allowDemoFallback) return seedGenerateHistory(propertyId, days);
      throw new DataUnavailableError("sem ligação à base de dados");
    }

    try {
      const live = await getLiveSnapshot();
      const hub = live?.hubs.find((h) => h.propertyId === propertyId);
      if (!hub) return [];

      const cutoff = new Date(Date.now() - days * 24 * 3600000).toISOString();
      const { data, error } = await db
        .from(scope.readingsTable)
        .select("hub_id, temperature, humidity, voc, sound_dbfs, sound_max_dbfs, sound_loud_seconds, recorded_at")
        .eq("property_id", propertyId)
        .gte("recorded_at", cutoff)
        .order("recorded_at", { ascending: true });
      if (error && !scope.allowDemoFallback) throw new DataUnavailableError(error.message);

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
      if (scope.allowDemoFallback) {
        console.error("[data] getHistory live query failed, falling back to demo data:", err);
        return seedGenerateHistory(propertyId, days);
      }
      console.error("[data] getHistory falhou:", err);
      throw err instanceof DataUnavailableError ? err : new DataUnavailableError("falha na leitura");
    }
  }

  // Registo de eventos dos satélites de uma casa (fuga/movimento/porta-janela).
  async function getSatelliteEvents(propertyId: string, days: number): Promise<SatelliteEvent[]> {
    const db = scope.db;
    if (!db) {
      if (scope.allowDemoFallback) return seedGenerateSatelliteEvents(propertyId, days);
      throw new DataUnavailableError("sem ligação à base de dados");
    }

    try {
      const live = await getLiveSnapshot();
      if (!live) return [];
      const satellitesById = new Map(live.satellites.map((s) => [s.id, s]));

      const cutoff = new Date(Date.now() - days * 24 * 3600000).toISOString();
      const { data, error } = await db
        .from("rsn_events")
        .select("node_id, event, recorded_at")
        .eq("property_id", propertyId)
        .gte("recorded_at", cutoff)
        .order("recorded_at", { ascending: false });
      if (error && !scope.allowDemoFallback) throw new DataUnavailableError(error.message);

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
      if (scope.allowDemoFallback) {
        console.error("[data] getSatelliteEvents live query failed, falling back to demo data:", err);
        return seedGenerateSatelliteEvents(propertyId, days);
      }
      console.error("[data] getSatelliteEvents falhou:", err);
      throw err instanceof DataUnavailableError ? err : new DataUnavailableError("falha na leitura");
    }
  }

  // Autorizações que o inquilino dá ao dono para ver categorias restritas
  // (presença/comportamento) dos satélites da casa. Ver lib/consent.ts.
  async function getConsentGrants(propertyId?: string): Promise<ConsentGrant[]> {
    const live = await getLiveSnapshot();
    const grants = live ? live.consentGrants : CONSENT_GRANTS;
    return propertyId ? grants.filter((g) => g.propertyId === propertyId) : grants;
  }

  async function hasConsent(propertyId: string, category: RestrictedCategory): Promise<boolean> {
    const live = await getLiveSnapshot();
    if (!live) return seedHasConsent(propertyId, category);
    return live.consentGrants.some((g) => g.propertyId === propertyId && g.category === category && g.active);
  }

  async function getOverviewStats() {
    const live = await getLiveSnapshot();
    const properties = live ? live.properties : PROPERTIES;
    const hubs = live ? live.hubs : HUBS;
    const satellites = live ? live.satellites : SATELLITES;
    const alerts = live ? live.alerts : ALERTS;

    // Hubs sem valor (null) ficam fora da média, não contam como 0.
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

  // Saúde da frota para a vista de administração — dispositivos que precisam
  // de atenção física (bateria fraca, offline), de qualquer conta de dono.
  async function getFleetHealth() {
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

  return {
    getProperties,
    getProperty,
    getHub,
    getSatellites,
    getTenants,
    getTenant,
    getTenantByProperty,
    getAlerts,
    getInsights,
    getHistory,
    getSatelliteEvents,
    getConsentGrants,
    hasConsent,
    getOverviewStats,
    getFleetHealth
  };
}

export type DataReader = ReturnType<typeof createDataReader>;

// ---------------------------------------------------------------------------
// MODO ANTIGO ("legacy"): chave de administração, sem login. TEMPORÁRIO — até
// ao PR 5 (inquilino com sessão) e à passagem de /admin ao âmbito de
// administrador. O leitor é criado uma vez POR PEDIDO (React cache), nunca
// guardado de forma global.
// ---------------------------------------------------------------------------
const legacyReader = cache(() => createDataReader(legacyServiceScope()));

export const getProperties = () => legacyReader().getProperties();
export const getProperty = (id: string) => legacyReader().getProperty(id);
export const getHub = (propertyId: string) => legacyReader().getHub(propertyId);
export const getSatellites = (propertyId?: string) => legacyReader().getSatellites(propertyId);
export const getTenants = () => legacyReader().getTenants();
export const getTenant = (id: string) => legacyReader().getTenant(id);
export const getTenantByProperty = (propertyId: string) => legacyReader().getTenantByProperty(propertyId);
export const getAlerts = (propertyId?: string) => legacyReader().getAlerts(propertyId);
export const getInsights = (propertyId?: string) => legacyReader().getInsights(propertyId);
export const getHistory = (propertyId: string, days: number) => legacyReader().getHistory(propertyId, days);
export const getSatelliteEvents = (propertyId: string, days: number) => legacyReader().getSatelliteEvents(propertyId, days);
export const getConsentGrants = (propertyId?: string) => legacyReader().getConsentGrants(propertyId);
export const hasConsent = (propertyId: string, category: RestrictedCategory) => legacyReader().hasConsent(propertyId, category);
export const getOverviewStats = () => legacyReader().getOverviewStats();
export const getFleetHealth = () => legacyReader().getFleetHealth();

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

import type {
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
import { averageOrNull } from "./readings";
import { buildSnapshot, eventToCapability, LOW_BATTERY_THRESHOLD, type RawRows, type Snapshot } from "./data-rules";
import { DataUnavailableError, type DataScope } from "./data-scope";

// ---------------------------------------------------------------------------
// Camada de dados da aplicação, em três partes:
//
//   lib/data-rules.ts  — regras puras (limites, alertas, conselhos). Recebe
//                        linhas em bruto e devolve o que se mostra.
//   lib/data-scope.ts  — COM QUE IDENTIDADE se lê (administrador ou a sessão
//                        da própria pessoa).
//   este ficheiro      — lê as linhas através de um âmbito e aplica as regras.
//
// `createDataReader(scope)` devolve as funções de leitura para UM âmbito. O
// instantâneo (uma ronda de pedidos) fica guardado dentro desse leitor, que
// vive só durante o pedido: nunca há dados numa variável do módulo, por isso
// nada se partilha entre utilizadores.
//
// Não há dados de demonstração nem modo antigo: se a leitura falhar, é um erro
// claro (DataUnavailableError), nunca dados inventados.
// ---------------------------------------------------------------------------

// Só a página inicial pública usa isto (para o cartão «Ligado ao Supabase»).
export const isLiveMode =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// Uma ronda de pedidos às tabelas. Qualquer erro é uma falha clara — uma regra
// da base de dados a recusar NUNCA pode passar por «não há dados».
async function loadSnapshot(scope: DataScope): Promise<Snapshot> {
  const db = scope.db;
  if (!db) throw new DataUnavailableError("sem ligação à base de dados");

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

    const failed = results.find((r) => r.error);
    if (failed?.error) throw new DataUnavailableError(failed.error.message);

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
    console.error("[data] leitura falhou:", err);
    throw err instanceof DataUnavailableError ? err : new DataUnavailableError("falha na leitura");
  }
}

export function createDataReader(scope: DataScope) {
  // Um instantâneo por leitor (ou seja, por pedido).
  let snapshotPromise: Promise<Snapshot> | undefined;
  const getLiveSnapshot = () => (snapshotPromise ??= loadSnapshot(scope));

  async function getProperties(): Promise<Property[]> {
    return (await getLiveSnapshot()).properties;
  }

  async function getProperty(id: string): Promise<Property | undefined> {
    const properties = await getProperties();
    return properties.find((p) => p.id === id);
  }

  // Um Hub por casa.
  async function getHub(propertyId: string): Promise<Hub | undefined> {
    return (await getLiveSnapshot()).hubs.find((h) => h.propertyId === propertyId);
  }

  async function getSatellites(propertyId?: string): Promise<Satellite[]> {
    const { satellites } = await getLiveSnapshot();
    return propertyId ? satellites.filter((s) => s.propertyId === propertyId) : satellites;
  }

  async function getTenants(): Promise<Tenant[]> {
    return (await getLiveSnapshot()).tenants;
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
    const { alerts } = await getLiveSnapshot();
    const filtered = propertyId ? alerts.filter((a) => a.propertyId === propertyId) : alerts;
    return [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async function getInsights(propertyId?: string): Promise<Insight[]> {
    const { insights } = await getLiveSnapshot();
    const filtered = propertyId ? insights.filter((i) => i.propertyId === propertyId) : insights;
    return [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // Histórico ambiente do Hub de uma casa (uma série por casa — só há um Hub
  // por casa).
  async function getHistory(propertyId: string, days: number): Promise<HistoryPoint[]> {
    const db = scope.db;
    if (!db) throw new DataUnavailableError("sem ligação à base de dados");

    try {
      const live = await getLiveSnapshot();
      const hub = live.hubs.find((h) => h.propertyId === propertyId);
      if (!hub) return [];

      const cutoff = new Date(Date.now() - days * 24 * 3600000).toISOString();
      const { data, error } = await db
        .from(scope.readingsTable)
        .select("hub_id, temperature, humidity, voc, sound_dbfs, sound_max_dbfs, sound_loud_seconds, recorded_at")
        .eq("property_id", propertyId)
        .gte("recorded_at", cutoff)
        .order("recorded_at", { ascending: true });
      if (error) throw new DataUnavailableError(error.message);

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
      console.error("[data] getHistory falhou:", err);
      throw err instanceof DataUnavailableError ? err : new DataUnavailableError("falha na leitura");
    }
  }

  // Registo de eventos dos satélites de uma casa (fuga/movimento/porta-janela).
  async function getSatelliteEvents(propertyId: string, days: number): Promise<SatelliteEvent[]> {
    const db = scope.db;
    if (!db) throw new DataUnavailableError("sem ligação à base de dados");

    try {
      const live = await getLiveSnapshot();
      const satellitesById = new Map(live.satellites.map((s) => [s.id, s]));

      const cutoff = new Date(Date.now() - days * 24 * 3600000).toISOString();
      const { data, error } = await db
        .from("rsn_events")
        .select("node_id, event, recorded_at")
        .eq("property_id", propertyId)
        .gte("recorded_at", cutoff)
        .order("recorded_at", { ascending: false });
      if (error) throw new DataUnavailableError(error.message);

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
      console.error("[data] getSatelliteEvents falhou:", err);
      throw err instanceof DataUnavailableError ? err : new DataUnavailableError("falha na leitura");
    }
  }

  // Autorizações que o inquilino dá ao dono para ver categorias restritas
  // (presença/comportamento) dos satélites da casa. Ver lib/consent.ts.
  async function getConsentGrants(propertyId?: string): Promise<ConsentGrant[]> {
    const { consentGrants } = await getLiveSnapshot();
    return propertyId ? consentGrants.filter((g) => g.propertyId === propertyId) : consentGrants;
  }

  async function hasConsent(propertyId: string, category: RestrictedCategory): Promise<boolean> {
    const { consentGrants } = await getLiveSnapshot();
    return consentGrants.some((g) => g.propertyId === propertyId && g.category === category && g.active);
  }

  async function getOverviewStats() {
    const { properties, hubs, satellites, alerts } = await getLiveSnapshot();

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
    const { hubs, satellites } = await getLiveSnapshot();

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

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

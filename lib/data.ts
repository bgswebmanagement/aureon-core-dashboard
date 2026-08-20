import { Alert, ConsentGrant, Hub, HistoryPoint, Insight, Property, RestrictedCategory, Satellite, SatelliteEvent, Tenant } from "./types";
import {
  ALERTS,
  CONSENT_GRANTS,
  generateHistory,
  generateSatelliteEvents,
  hasConsent as seedHasConsent,
  HUBS,
  INSIGHTS,
  PROPERTIES,
  SATELLITES,
  TENANTS
} from "./seed";

// ---------------------------------------------------------------------------
// Single data-access surface used by every page/component.
//
// Today this reads from the deterministic seed dataset (lib/seed.ts) so the
// app is fully functional the moment it's deployed, with no backend needed.
//
// Once NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set
// (see supabase/schema.sql + README.md), swap the bodies of these functions
// for real Supabase queries — the function signatures below are the contract
// every screen already codes against, so no component needs to change.
// ---------------------------------------------------------------------------

export const isLiveMode =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function getProperties(): Promise<Property[]> {
  return PROPERTIES;
}

export async function getProperty(id: string): Promise<Property | undefined> {
  return PROPERTIES.find((p) => p.id === id);
}

// One Hub per property.
export async function getHub(propertyId: string): Promise<Hub | undefined> {
  return HUBS.find((h) => h.propertyId === propertyId);
}

export async function getSatellites(propertyId?: string): Promise<Satellite[]> {
  return propertyId ? SATELLITES.filter((s) => s.propertyId === propertyId) : SATELLITES;
}

export async function getTenants(): Promise<Tenant[]> {
  return TENANTS;
}

export async function getTenant(id: string): Promise<Tenant | undefined> {
  return TENANTS.find((t) => t.id === id);
}

export async function getTenantByProperty(propertyId: string): Promise<Tenant | undefined> {
  return TENANTS.find((t) => t.propertyId === propertyId);
}

export async function getAlerts(propertyId?: string): Promise<Alert[]> {
  const list = propertyId ? ALERTS.filter((a) => a.propertyId === propertyId) : ALERTS;
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getInsights(propertyId?: string): Promise<Insight[]> {
  const list = propertyId ? INSIGHTS.filter((i) => i.propertyId === propertyId) : INSIGHTS;
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Ambient history for a property's Hub (one series per property — there is
// only one Hub per property).
export async function getHistory(propertyId: string, days: number): Promise<HistoryPoint[]> {
  return generateHistory(propertyId, days);
}

// Event log for a property's satellites (leak/motion/door-window events).
export async function getSatelliteEvents(propertyId: string, days: number): Promise<SatelliteEvent[]> {
  return generateSatelliteEvents(propertyId, days);
}

// Tenant-controlled authorizations for the owner to see restricted (presence/
// behaviour) satellite data categories for their property. See lib/consent.ts
// for how these gate what an owner-viewer actually sees.
export async function getConsentGrants(propertyId?: string): Promise<ConsentGrant[]> {
  return propertyId ? CONSENT_GRANTS.filter((g) => g.propertyId === propertyId) : CONSENT_GRANTS;
}

export async function hasConsent(propertyId: string, category: RestrictedCategory): Promise<boolean> {
  return seedHasConsent(propertyId, category);
}

export async function getOverviewStats() {
  const properties = await getProperties();
  const hubs = HUBS;
  const alerts = await getAlerts();

  const avgTemp = hubs.reduce((s, h) => s + h.temperature, 0) / hubs.length;
  const avgHum = hubs.reduce((s, h) => s + h.humidity, 0) / hubs.length;
  const avgVoc = hubs.reduce((s, h) => s + h.voc, 0) / hubs.length;
  const withAlerts = properties.filter((p) => p.status !== "normal").length;
  const criticalAlerts = alerts.filter((a) => a.severity === "critico" && a.active).length;

  return {
    totalProperties: properties.length,
    totalHubs: hubs.length,
    totalSatellites: SATELLITES.length,
    propertiesWithAlerts: withAlerts,
    propertiesNormal: properties.length - withAlerts,
    avgTemp: round1(avgTemp),
    avgHumidity: round1(avgHum),
    avgVoc: Math.round(avgVoc),
    criticalAlerts
  };
}

// Fleet-health numbers for the Aureon Core admin view — devices that need
// physical attention (low battery, offline), regardless of which owner
// account they belong to.
const LOW_BATTERY_THRESHOLD = 30; // %

export async function getFleetHealth() {
  const hubsOffline = HUBS.filter((h) => !h.online).length;
  const satellitesOffline = SATELLITES.filter((s) => !s.online).length;
  const satellitesLowBattery = SATELLITES.filter((s) => s.battery < LOW_BATTERY_THRESHOLD).length;

  return {
    totalHubs: HUBS.length,
    hubsOffline,
    totalSatellites: SATELLITES.length,
    satellitesOffline,
    satellitesLowBattery
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

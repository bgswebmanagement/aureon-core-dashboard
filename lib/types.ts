export type Status = "normal" | "atencao" | "critico";

export type Tenant = {
  id: string;
  name: string;
  email: string;
  propertyId: string;
};

export type DeviceState = "normal" | "alert";

// The Hub is the single physical unit installed in a property (plugged in,
// Wi-Fi connected, onboard ambient sensors). There is ONE Hub per property —
// not one per room. `location` is just which room it happens to sit in.
export type Hub = {
  id: string;
  propertyId: string;
  location: string;
  // null = the latest reading didn't include this value (e.g. the VOC sensor
  // is still warming up). Never coerce to 0 — 0 would look like perfect air.
  temperature: number | null;
  humidity: number | null;
  // VOC falls back to the last valid value from the past 30 minutes (see lib/data.ts).
  voc: number | null;
  // Ambient sound LEVEL in dBFS (never audio). null = hub hasn't reported it.
  sound_dbfs: number | null;
  online: boolean;
  status: Status;
};

export type SatelliteCapability = "leak" | "motion" | "doorWindow";

// A Satellite is a battery-powered Remote Sensor Node (looks like a smoke
// alarm). A property has 1-3 of these. They are event-based, not
// continuous — they report discrete events (a leak detected, motion seen, a
// door opened) rather than an ongoing temperature/humidity feed. The pilot's
// typical config is one leak+motion satellite in the bathroom, plus optional
// door/window satellites elsewhere.
export type Satellite = {
  id: string;
  propertyId: string;
  label: string; // where it's placed, e.g. "Casa de Banho"
  capabilities: SatelliteCapability[];
  leakState: DeviceState; // meaningful only if capabilities includes "leak"
  doorWindowState: "Aberto" | "Fechado" | null; // meaningful only if capabilities includes "doorWindow"
  battery: number; // %
  online: boolean;
  lastEventAt: string; // ISO
};

export type Property = {
  id: string;
  name: string;
  address: string;
  city: string;
  status: Status;
  hubId: string;
  hubOnline: boolean;
  tenantId?: string;
};

export type Severity = "informativo" | "aviso" | "critico";

export type Alert = {
  id: string;
  propertyId: string;
  deviceLabel?: string; // hub location or satellite label, for display only
  title: string;
  message: string;
  severity: Severity;
  tag: string;
  createdAt: string; // ISO
  active: boolean;
};

export type Insight = {
  id: string;
  propertyId: string;
  deviceLabel?: string;
  title: string;
  message: string;
  severity: Severity;
  recommendation: string;
  tag: string;
  createdAt: string;
};

export type Metric = "temperature" | "humidity" | "voc";

// Metrics shown on the history page. "sound_dbfs" is kept out of `Metric`
// because the evidence report only handles threshold-based metrics.
export type ChartMetric = Metric | "sound_dbfs";

export type HistoryPoint = {
  timestamp: string; // ISO
  // null = this reading omitted the value (chart leaves a gap).
  temperature: number | null;
  humidity: number | null;
  voc: number | null;
  sound_dbfs?: number | null; // relative noise level, Leq over the interval (dBFS) — never audio
  sound_max_dbfs?: number | null; // loudest level in the interval (dBFS)
  sound_loud_seconds?: number | null; // seconds above the -30 dBFS threshold in the interval
};

// A logged event from a Satellite (leak detected, motion seen, door/window
// opened or closed) — these are discrete, not a continuous series.
export type SatelliteEvent = {
  id: string;
  propertyId: string;
  satelliteId: string;
  satelliteLabel: string;
  type: SatelliteCapability;
  timestamp: string; // ISO
};

// Who is looking at the data. Tenants always see everything about their own
// home. Owners/agencies only see what's relevant to protecting the property
// (ambient conditions, leaks) by default — motion and door/window events are
// presence/behaviour data, not property-damage data, so they're hidden from
// the owner unless the tenant has explicitly granted access (ConsentGrant).
// Admin (Aureon Core staff) is the platform operator and is not subject to
// this restriction — the same way they already have unrestricted access via
// the Supabase table editor.
export type ViewerRole = "tenant" | "owner" | "admin";

// A category of data that is presence/behaviour-revealing rather than
// property-damage-revealing, and therefore requires tenant consent before an
// owner can see it. Leak events are NOT in this list — a leak is a
// property-damage signal the owner always needs to see to protect the home.
// "sound" is the Hub's ambient sound level (dBFS) — a number, never audio —
// but it can still reveal activity in the home, so it is restricted too.
export type RestrictedCategory = "motion" | "doorWindow" | "sound";

// Tenant-controlled authorization for the owner to see a restricted data
// category for their property, e.g. "for a noise/activity dispute in August
// 2026". Tenant can grant/revoke at any time; grants can optionally expire.
export type ConsentGrant = {
  id: string;
  propertyId: string;
  category: RestrictedCategory;
  reason?: string;
  grantedAt: string; // ISO
  expiresAt?: string; // ISO — undefined means no expiry until revoked
  active: boolean;
};

export type IngestPayload = {
  device_id: string;
  timestamp: string;
  temperature?: number;
  humidity?: number;
  voc?: number;
  pressure?: number;
  // Relative noise LEVEL only (dBFS, e.g. -32.5) — never audio content.
  // Per 10-minute interval: Leq, maximum, and seconds above -30 dBFS.
  sound_dbfs?: number;
  sound_max_dbfs?: number; // optional
  sound_loud_seconds?: number; // optional
  rsn_events?: Array<{
    node_id: string;
    event: string;
    battery?: number;
    rssi?: number;
    timestamp: string;
  }>;
};

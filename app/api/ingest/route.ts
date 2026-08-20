import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { IngestPayload } from "@/lib/types";

// ---------------------------------------------------------------------------
// POST /api/ingest
//
// This is the "cloud endpoint" that matches the Hub + Remote Sensor Node
// (RSN) architecture agreed with Count Customs: the Hub sends a POST here
// whenever it has an internet connection, with its own ambient readings
// (one set per Hub, not per room) plus any RSN satellite events since the
// last sync. When offline, the Hub keeps operating locally as designed —
// this endpoint is purely an additional sync layer, not a dependency.
//
// Auth: optional shared-secret header, set INGEST_TOKEN in your Vercel
// project to require `Authorization: Bearer <token>` on every request from
// the Hub firmware. Leave INGEST_TOKEN unset while testing.
//
// Payload (JSON):
// {
//   "device_id": "AC-HUB-0001",
//   "timestamp": "2026-09-01T10:00:00Z",
//   "temperature": 22.4,
//   "humidity": 58,
//   "voc": 45,
//   "pressure": 1013.2,
//   "rsn_events": [
//     { "node_id": "AC-RSN-0007", "event": "leak_detected", "battery": 92, "rssi": -61, "timestamp": "2026-09-01T09:58:00Z" }
//   ]
// }
//
// `event` for an rsn_event is one of: "leak_detected", "motion_detected",
// "door_open", "door_closed" — matching the satellite's capabilities
// ("leak" | "motion" | "doorWindow" in lib/types.ts).
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const token = process.env.INGEST_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let payload: IngestPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!payload.device_id || !payload.timestamp) {
    return NextResponse.json({ error: "device_id and timestamp are required" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    // Demo mode: no Supabase configured yet. Accept the payload so Count
    // Customs can test hitting this endpoint end-to-end before the
    // pilot manufacturing order is placed — but nothing is persisted.
    console.log("[ingest] (demo mode, not persisted)", JSON.stringify(payload));
    return NextResponse.json({ ok: true, mode: "demo", persisted: false });
  }

  const { data: hub, error: hubError } = await supabase
    .from("hubs")
    .select("id, property_id")
    .eq("device_id", payload.device_id)
    .maybeSingle();

  if (hubError) {
    return NextResponse.json({ error: hubError.message }, { status: 500 });
  }
  if (!hub) {
    return NextResponse.json({ error: `unknown device_id: ${payload.device_id}` }, { status: 404 });
  }

  const inserts: PromiseLike<{ error: { message: string } | null }>[] = [];

  if (
    payload.temperature !== undefined ||
    payload.humidity !== undefined ||
    payload.voc !== undefined ||
    payload.pressure !== undefined
  ) {
    inserts.push(
      supabase.from("sensor_readings").insert({
        hub_id: hub.id,
        property_id: hub.property_id,
        recorded_at: payload.timestamp,
        temperature: payload.temperature ?? null,
        humidity: payload.humidity ?? null,
        voc: payload.voc ?? null,
        pressure: payload.pressure ?? null
      })
    );
  }

  for (const event of payload.rsn_events ?? []) {
    inserts.push(
      supabase.from("rsn_events").insert({
        hub_id: hub.id,
        property_id: hub.property_id,
        node_id: event.node_id,
        event: event.event,
        battery: event.battery ?? null,
        rssi: event.rssi ?? null,
        recorded_at: event.timestamp
      })
    );
    // Keep the satellite's battery/last_seen fresh too. No-op if the
    // satellite row doesn't exist yet (device_id not provisioned in
    // Supabase) — that's fine, the event itself is still recorded above.
    const satelliteUpdate: { last_seen: string; battery?: number } = { last_seen: event.timestamp };
    if (event.battery !== undefined) satelliteUpdate.battery = event.battery;
    inserts.push(supabase.from("satellites").update(satelliteUpdate).eq("device_id", event.node_id));
  }

  inserts.push(supabase.from("hubs").update({ last_seen: payload.timestamp }).eq("id", hub.id));

  const results = await Promise.all(inserts);
  const failed = results.find((r) => r?.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode: "live", persisted: true });
}

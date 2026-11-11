import type {
  Alert,
  ConsentGrant,
  Hub,
  Insight,
  Property,
  RestrictedCategory,
  Satellite,
  SatelliteCapability,
  Status,
  Tenant
} from "./types";

// ---------------------------------------------------------------------------
// REGRAS PURAS (sem base de dados, sem cookies, sem relógio escondido).
//
// Recebe linhas "em bruto" (como vêm do Supabase) e devolve o que a aplicação
// mostra: casas, hubs, satélites, alertas e conselhos. Não sabe QUEM está a
// pedir nem de onde vieram as linhas — isso é decidido em lib/data-scope.ts.
// Assim a mesma lógica serve o administrador, o dono e o inquilino, e pode
// ser testada sozinha (e2e/data-rules.spec.ts).
//
// NÃO importar aqui nada de servidor (cookies, clientes Supabase).
// ---------------------------------------------------------------------------

// --- Limites (espelham lib/seed.ts para os dados reais e de demonstração
// se comportarem da mesma forma) -------------------------------------------
export const HUMIDITY_MOLD_RISK = 70; // %
export const VOC_POOR_AIR = 120; // índice
export const VOC_CRITICAL = 200; // índice
export const TEMP_HIGH = 30; // °C
export const HUMIDITY_VENTILATION_INFO = 60; // %
export const TEMP_INFO = 24; // °C
export const LOW_BATTERY_THRESHOLD = 30; // %
export const HUB_ONLINE_MINUTES = 30; // o hub reporta de ~10 em 10 min
export const SATELLITE_ONLINE_HOURS = 48; // os satélites reportam eventos, não de forma contínua

export const VOC_FALLBACK_MINUTES = 30; // o cartão mostra o último VOC válido desta janela se a última leitura não tiver
export const VOC_CONSECUTIVE_READINGS = 3; // um alerta de VOC precisa de tantas leituras válidas seguidas acima do limite

export type VocLevel = "aviso" | "critico";

// Valores em falta (null) são ignorados — nunca contam como "acima" de nada.
export function computeHubStatus(temperature: number | null, humidity: number | null, sustainedVoc: VocLevel | null): Status {
  if (
    (humidity != null && humidity > HUMIDITY_MOLD_RISK) ||
    (temperature != null && temperature > TEMP_HIGH) ||
    sustainedVoc === "critico"
  ) {
    return "atencao";
  }
  return "normal";
}

// `recentValid` = leituras de VOC válidas (não nulas) de um hub, da mais nova
// para a mais antiga. O índice VOC é relativo ao local, por isso uma leitura
// alta isolada não chega: as últimas N leituras válidas têm de estar todas
// acima do limite. O nível é dado pela mais baixa delas (todas acima do limite
// crítico para ser "critico").
export function sustainedVocLevel(recentValid: { voc: number }[]): VocLevel | null {
  if (recentValid.length < VOC_CONSECUTIVE_READINGS) return null;
  const lowest = Math.min(...recentValid.slice(0, VOC_CONSECUTIVE_READINGS).map((r) => r.voc));
  if (lowest > VOC_CRITICAL) return "critico";
  if (lowest > VOC_POOR_AIR) return "aviso";
  return null;
}

export function minutesSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return (now.getTime() - new Date(iso).getTime()) / 60000;
}

// Converte o texto de rsn_events.event no tipo SatelliteCapability da app.
export function eventToCapability(event: string): SatelliteCapability | null {
  if (event === "leak_detected") return "leak";
  if (event === "motion_detected") return "motion";
  if (event === "door_open" || event === "door_closed") return "doorWindow";
  return null;
}

// --- Linhas em bruto ---------------------------------------------------------
// Só as colunas de que a app precisa. Em particular os eventos NÃO têm
// `battery` nem `rssi`: a bateria vem de `satellites` e o sinal nunca é lido.
export type RawRows = {
  properties: { id: string; name: string; address: string; city: string }[];
  hubs: { id: string; device_id: string; property_id: string; location: string | null; last_seen: string | null }[];
  satellites: {
    device_id: string;
    property_id: string;
    label: string;
    capabilities: string[] | null;
    battery: number | null;
    last_seen: string | null;
  }[];
  tenants: { id: string; property_id: string; name: string; email: string }[];
  // da mais nova para a mais antiga
  readings: {
    hub_id: string;
    temperature: number | null;
    humidity: number | null;
    voc: number | null;
    sound_dbfs: number | null;
    recorded_at: string;
  }[];
  // da mais nova para a mais antiga
  events: { node_id: string; event: string; recorded_at: string }[];
  consents: {
    id: string;
    property_id: string;
    category: RestrictedCategory;
    reason: string | null;
    granted_at: string;
    expires_at: string | null;
    active: boolean;
  }[];
};

export type Snapshot = {
  properties: Property[];
  hubs: Hub[];
  satellites: Satellite[];
  tenants: Tenant[];
  alerts: Alert[];
  insights: Insight[];
  consentGrants: ConsentGrant[];
};

// Constrói tudo o que a app mostra a partir das linhas em bruto.
// `now` entra como parâmetro (em vez de ler o relógio aqui dentro) para o
// resultado depender só do que se passa.
export type BuildOptions = {
  // true quando as linhas vêm de uma vista que pode esconder a atividade dos
  // satélites (dono sem consentimento): então «sem last_seen» quer dizer
  // «não sei» (null), e não «nunca reportou».
  activityMayBeHidden?: boolean;
};

export function buildSnapshot(raw: RawRows, now: Date, options: BuildOptions = {}): Snapshot {
  const hidden = options.activityMayBeHidden === true;
  // Última leitura por hub (linhas já da mais nova para a mais antiga).
  const latestReadingByHub = new Map<string, RawRows["readings"][number]>();
  for (const r of raw.readings) {
    if (!latestReadingByHub.has(r.hub_id)) latestReadingByHub.set(r.hub_id, r);
  }

  // Leituras de VOC válidas mais recentes por hub, da mais nova para a mais
  // antiga. O firmware omite `voc` enquanto o sensor aquece, por isso a última
  // leitura pode não ter.
  const recentVocByHub = new Map<string, { voc: number; recorded_at: string }[]>();
  for (const r of raw.readings) {
    if (r.voc == null) continue;
    const list = recentVocByHub.get(r.hub_id) ?? [];
    if (list.length < VOC_CONSECUTIVE_READINGS) {
      list.push({ voc: r.voc, recorded_at: r.recorded_at });
      recentVocByHub.set(r.hub_id, list);
    }
  }

  // Último evento por satélite (linhas já da mais nova para a mais antiga).
  const latestEventByNode = new Map<string, { event: string; recorded_at: string }>();
  // Última FUGA por satélite. Só os eventos leak_detected contam para o alerta
  // de fuga: o firmware nunca envia «fuga resolvida», por isso o alerta fica
  // ativo até alguém o limpar (a fazer) — um evento de movimento ou de porta
  // depois da fuga NÃO a apaga.
  const latestLeakByNode = new Map<string, string>();
  for (const e of raw.events) {
    if (!latestEventByNode.has(e.node_id)) latestEventByNode.set(e.node_id, e);
    if (e.event === "leak_detected" && !latestLeakByNode.has(e.node_id)) latestLeakByNode.set(e.node_id, e.recorded_at);
  }

  // O modelo da app assume UM hub por casa, mas nada na base de dados o
  // garante — se uma casa ficar com mais de um hub (por exemplo, sobra de uma
  // tentativa anterior), ficamos com o que tem dados (last_seen mais recente).
  // Isto acontece ANTES de construir o `Hub[]`, por isso todas as funções
  // (getHub, getFleetHealth, getOverviewStats, alertas, cartões…) recebem
  // logo o certo — não há uma lista em bruto onde alguém possa ler o errado.
  const bestHubRowByProperty = new Map<string, RawRows["hubs"][number]>();
  for (const h of raw.hubs) {
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
    // VOC mais recente se existir; senão o último válido dos últimos 30
    // minutos; senão null (sensor a aquecer) — nunca 0.
    const voc =
      reading?.voc ??
      (lastValidVoc && (minutesSince(lastValidVoc.recorded_at, now) ?? Infinity) <= VOC_FALLBACK_MINUTES ? lastValidVoc.voc : null);
    const vocLevel = sustainedVocLevel(recentVoc);
    if (vocLevel) sustainedVocByProperty.set(h.property_id, { level: vocLevel, value: lastValidVoc.voc, recordedAt: lastValidVoc.recorded_at });
    const mins = minutesSince(h.last_seen, now);
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
  // Quando foi registada a última leitura de cada hub — os alertas mostram a
  // hora real da medição em vez de "agora" (a hora a que a página é gerada).
  const readingRecordedAtByProperty = new Map<string, string>();
  for (const h of bestHubRowByProperty.values()) {
    const reading = latestReadingByHub.get(h.id);
    if (reading) readingRecordedAtByProperty.set(h.property_id, reading.recorded_at);
  }

  const satellites: Satellite[] = raw.satellites.map((s) => {
    const latestEvent = latestEventByNode.get(s.device_id);
    const capabilities = (s.capabilities ?? []) as SatelliteCapability[];
    const leakState: "normal" | "alert" =
      capabilities.includes("leak") && latestLeakByNode.has(s.device_id) ? "alert" : "normal";
    let doorWindowState: "Aberto" | "Fechado" | null = null;
    if (capabilities.includes("doorWindow")) {
      if (latestEvent?.event === "door_open") doorWindowState = "Aberto";
      else if (latestEvent?.event === "door_closed") doorWindowState = "Fechado";
    }
    const mins = minutesSince(s.last_seen, now);
    return {
      id: s.device_id,
      propertyId: s.property_id,
      label: s.label,
      capabilities,
      leakState,
      doorWindowState,
      battery: s.battery ?? 100,
      online: mins !== null ? mins <= SATELLITE_ONLINE_HOURS * 60 : hidden ? null : false,
      lastEventAt: latestEvent?.recorded_at ?? s.last_seen ?? (hidden ? null : new Date(0).toISOString())
    };
  });
  const satellitesByProperty = new Map<string, Satellite[]>();
  for (const s of satellites) {
    const list = satellitesByProperty.get(s.propertyId) ?? [];
    list.push(s);
    satellitesByProperty.set(s.propertyId, list);
  }

  const tenants: Tenant[] = raw.tenants.map((t) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    propertyId: t.property_id
  }));
  const tenantByProperty = new Map(tenants.map((t) => [t.propertyId, t]));

  const properties: Property[] = raw.properties.map((p) => {
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

  const consentGrants: ConsentGrant[] = raw.consents.map((c) => ({
    id: c.id,
    propertyId: c.property_id,
    category: c.category,
    reason: c.reason ?? undefined,
    grantedAt: c.granted_at,
    expiresAt: c.expires_at ?? undefined,
    // «ativa» = marcada como ativa E ainda não expirada (como a regra da base de
    // dados, que ignora as expiradas) — assim uma autorização expirada nunca
    // aparece como válida, nem ao dono nem ao inquilino.
    active: c.active && (!c.expires_at || new Date(c.expires_at).getTime() > now.getTime())
  }));

  // Alertas/conselhos, calculados como em lib/seed.ts mas a partir do estado
  // real dos hubs/satélites em vez do conjunto fixo de demonstração.
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
          createdAt: latestLeakByNode.get(sat.id) ?? now.toISOString(),
          active: true
        });
      }
    }

    if (hub) {
      // Hora real em que a última leitura do hub foi registada — não "agora"
      // (a hora de gerar a página), para os alertas/conselhos mostrarem quando
      // a condição foi mesmo observada.
      const readingAt = readingRecordedAtByProperty.get(property.id) ?? now.toISOString();

      // Leituras em falta (null) nunca disparam alertas nem conselhos.
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

      // VOC: só depois de 3 leituras válidas seguidas acima do limite — uma
      // leitura alta isolada, ou leituras em falta, nunca geram alerta.
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
}

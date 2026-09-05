"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ConsentGrant, HistoryPoint, Metric, Property, SatelliteEvent, ViewerRole } from "@/lib/types";
import { formatDateTime } from "@/lib/ui";
import { idealRangeLabel } from "@/lib/seed";
import { filterEventsForViewer } from "@/lib/consent";
import { AllMetricsChart, SingleMetricChart } from "./HistoryChart";
import { IconDownload, IconLock } from "./icons";

const METRICS: { key: Metric; label: string; dot: string; risk?: number }[] = [
  { key: "temperature", label: "Temperatura", dot: "bg-orange-500" },
  { key: "humidity", label: "Humidade", dot: "bg-accent", risk: 70 },
  { key: "voc", label: "Índice VOC", dot: "bg-purple-500", risk: 120 }
];

const UNIT: Record<Metric, string> = { temperature: "°C", humidity: "%", voc: "" };

const EVENT_LABEL: Record<string, string> = {
  leak: "Fuga de água",
  motion: "Movimento",
  doorWindow: "Porta/Janela"
};

// Note: there is only ONE Hub per property, so this no longer has a
// per-room selector — just property + metric. Satellite events (leak,
// motion, door/window) are event-based, so they're shown as a log rather
// than a chart.
export function HistoryClient({
  properties,
  historyByProperty,
  satelliteEventsByProperty,
  consentGrantsByProperty = {},
  viewerRole = "tenant",
  initialPropertyId
}: {
  properties: Property[];
  historyByProperty: Record<string, HistoryPoint[]>;
  satelliteEventsByProperty: Record<string, SatelliteEvent[]>;
  consentGrantsByProperty?: Record<string, ConsentGrant[]>;
  viewerRole?: ViewerRole;
  initialPropertyId: string;
}) {
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [metric, setMetric] = useState<Metric>("humidity");
  const [days, setDays] = useState<7 | 14>(7);

  const property = properties.find((p) => p.id === propertyId) ?? properties[0];
  const fullHistory = historyByProperty[property.id] ?? [];
  const windowed = useMemo(() => fullHistory.slice(-days * 24), [fullHistory, days]);
  const metricDef = METRICS.find((m) => m.key === metric)!;
  const latest = windowed[windowed.length - 1];

  const tableRows = useMemo(() => [...windowed].reverse().slice(0, 100), [windowed]);
  const allEvents = satelliteEventsByProperty[property.id] ?? [];
  const grants = consentGrantsByProperty[property.id] ?? [];
  const visibleEvents = filterEventsForViewer(allEvents, viewerRole, grants);
  const hiddenCount = allEvents.length - visibleEvents.length;
  const events = visibleEvents.slice(0, 50);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap gap-2">
        {properties.map((p) => (
          <button
            key={p.id}
            onClick={() => setPropertyId(p.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              propertyId === p.id ? "bg-accent text-white" : "bg-panel text-muted hover:text-white"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                metric === m.key ? "bg-panel2 text-white ring-1 ring-accent/50" : "bg-panel text-muted hover:text-white"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${m.dot}`} /> {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => setDays(7)} className={`rounded-md px-2.5 py-1 ${days === 7 ? "bg-panel2 text-white" : "text-muted"}`}>
            7 dias
          </button>
          <button onClick={() => setDays(14)} className={`rounded-md px-2.5 py-1 ${days === 14 ? "bg-panel2 text-white" : "text-muted"}`}>
            14 dias
          </button>
          <Link
            href={`/report/${property.id}?metric=${metric}&days=${days}`}
            target="_blank"
            className="ml-2 flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted hover:border-accent/50 hover:text-white"
          >
            <IconDownload className="h-3.5 w-3.5" /> Relatório
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-panel p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold">
              {metricDef.label} — Últimos {days} Dias
            </div>
            <div className="text-xs text-muted">
              Hub · {idealRangeLabel(metric)}
            </div>
          </div>
          {latest && (
            <div className="text-right">
              <div className="text-2xl font-bold">
                {latest[metric]}
                {UNIT[metric]}
              </div>
              <div className="text-xs text-muted">Última leitura</div>
            </div>
          )}
        </div>
        <div className="mt-4">
          <SingleMetricChart data={windowed} metric={metric} riskLine={metricDef.risk} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-panel p-5">
        <div className="font-semibold">Últimas 24 Horas — Todas as Métricas</div>
        <div className="text-xs text-muted">Hub — {property.name}</div>
        <div className="mt-4">
          <AllMetricsChart data={fullHistory} />
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-500" /> Temperatura
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" /> Humidade
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-purple-500" /> Índice VOC
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-panel">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-semibold">Registo Detalhado ({tableRows.length} de {windowed.length} leituras)</div>
          <div className="text-xs text-muted">Evidência com data/hora — para disputas e seguradoras</div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel2 text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2 text-left">Data / Hora</th>
                <th className="px-4 py-2 text-right">Temperatura</th>
                <th className="px-4 py-2 text-right">Humidade</th>
                <th className="px-4 py-2 text-right">Índice VOC</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p) => (
                <tr key={p.timestamp} className="border-t border-border/60">
                  <td className="px-4 py-1.5 text-muted">{formatDateTime(p.timestamp)}</td>
                  <td className={`px-4 py-1.5 text-right ${metric === "temperature" ? "font-semibold text-white" : ""}`}>{p.temperature}°C</td>
                  <td className={`px-4 py-1.5 text-right ${metric === "humidity" ? "font-semibold text-white" : ""} ${p.humidity > 70 ? "text-warn" : ""}`}>
                    {p.humidity}%
                  </td>
                  <td className={`px-4 py-1.5 text-right ${metric === "voc" ? "font-semibold text-white" : ""} ${p.voc > 120 ? "text-warn" : ""}`}>{p.voc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {windowed.length > 100 && (
          <div className="border-t border-border p-3 text-center text-xs text-muted">
            A mostrar as 100 leituras mais recentes. Use o Relatório para o histórico completo.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-panel">
        <div className="border-b border-border p-4">
          <div className="font-semibold">Registo de Eventos dos Satélites ({events.length})</div>
          <div className="text-xs text-muted">Fuga de água, movimento e abertura de portas/janelas</div>
          {hiddenCount > 0 && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-muted">
              <IconLock className="h-3.5 w-3.5 shrink-0" />
              {hiddenCount} evento{hiddenCount > 1 ? "s" : ""} de movimento/porta-janela oculto{hiddenCount > 1 ? "s" : ""} — requer autorização do inquilino.
            </div>
          )}
        </div>
        {events.length === 0 ? (
          <div className="p-4 text-sm text-muted">Sem eventos registados neste período.</div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel2 text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Data / Hora</th>
                  <th className="px-4 py-2 text-left">Satélite</th>
                  <th className="px-4 py-2 text-left">Evento</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-border/60">
                    <td className="px-4 py-1.5 text-muted">{formatDateTime(e.timestamp)}</td>
                    <td className="px-4 py-1.5">{e.satelliteLabel}</td>
                    <td className="px-4 py-1.5">{EVENT_LABEL[e.type]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { HistoryPoint, Metric } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/ui";

const METRIC_COLOR: Record<Metric, string> = {
  temperature: "#f97316",
  humidity: "#3aa0ff",
  voc: "#a855f7"
};

const METRIC_UNIT: Record<Metric, string> = {
  temperature: "°C",
  humidity: "%",
  voc: ""
};

export function SingleMetricChart({
  data,
  metric,
  riskLine
}: {
  data: HistoryPoint[];
  metric: Metric;
  riskLine?: number;
}) {
  const color = METRIC_COLOR[metric];
  // Downsample to daily points for the 7-day trend line (keeps the SVG light).
  const daily = downsampleDaily(data);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={daily} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2732" vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatDate}
          stroke="#8792a2"
          tick={{ fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis stroke="#8792a2" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ background: "#10151d", border: "1px solid #1f2732", borderRadius: 10, fontSize: 12 }}
          labelFormatter={(v) => formatDateTime(String(v))}
          formatter={(v: number) => [`${v}${METRIC_UNIT[metric]}`, labelFor(metric)]}
        />
        {riskLine !== undefined && (
          <ReferenceLine
            y={riskLine}
            stroke={color}
            strokeDasharray="4 4"
            label={{
              value: metric === "humidity" ? `Risco de bolor (${riskLine}%)` : `Limite (${riskLine})`,
              position: "insideTopRight",
              fill: color,
              fontSize: 11
            }}
          />
        )}
        <Area type="monotone" dataKey={metric} stroke={color} strokeWidth={2} fill={`url(#fill-${metric})`} dot={{ r: 3, strokeWidth: 0, fill: color }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AllMetricsChart({ data }: { data: HistoryPoint[] }) {
  // Last 24h — hourly resolution.
  const last24 = data.slice(-24);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={last24} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2732" vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(v) => new Date(v).toLocaleTimeString("pt-PT", { hour: "2-digit" })}
          stroke="#8792a2"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis stroke="#8792a2" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={30} />
        <Tooltip
          contentStyle={{ background: "#10151d", border: "1px solid #1f2732", borderRadius: 10, fontSize: 12 }}
          labelFormatter={(v) => formatDateTime(String(v))}
        />
        <Line type="monotone" dataKey="temperature" stroke={METRIC_COLOR.temperature} strokeWidth={1.5} dot={false} name="Temperatura" />
        <Line type="monotone" dataKey="humidity" stroke={METRIC_COLOR.humidity} strokeWidth={1.5} dot={false} name="Humidade" />
        <Line type="monotone" dataKey="voc" stroke={METRIC_COLOR.voc} strokeWidth={1.5} dot={false} name="Índice VOC" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function labelFor(metric: Metric) {
  if (metric === "temperature") return "Temperatura";
  if (metric === "humidity") return "Humidade";
  return "Índice VOC";
}

function downsampleDaily(data: HistoryPoint[]): HistoryPoint[] {
  const byDay = new Map<string, HistoryPoint[]>();
  for (const p of data) {
    const day = p.timestamp.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(p);
  }
  return Array.from(byDay.entries()).map(([day, points]) => ({
    timestamp: `${day}T12:00:00.000Z`,
    temperature: avg(points.map((p) => p.temperature)),
    humidity: avg(points.map((p) => p.humidity)),
    voc: avg(points.map((p) => p.voc))
  }));
}

function avg(nums: number[]) {
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}

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
import { ChartMetric, HistoryPoint } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/ui";

const METRIC_COLOR: Record<ChartMetric, string> = {
  temperature: "#f97316",
  humidity: "#3aa0ff",
  voc: "#a855f7",
  sound_dbfs: "#14b8a6"
};

const METRIC_UNIT: Record<ChartMetric, string> = {
  temperature: "°C",
  humidity: "%",
  voc: "",
  sound_dbfs: " dBFS"
};

export function SingleMetricChart({
  data,
  metric,
  riskLine
}: {
  data: HistoryPoint[];
  metric: ChartMetric;
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
        <YAxis
          stroke="#8792a2"
          tick={{ fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={36}
          domain={metric === "sound_dbfs" ? [-96, 0] : undefined}
        />
        <Tooltip
          contentStyle={{ background: "#10151d", border: "1px solid #1f2732", borderRadius: 10, fontSize: 12 }}
          labelFormatter={(v) => formatDateTime(String(v))}
          formatter={(v: number, name: string) => [`${v}${METRIC_UNIT[metric]}`, name]}
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
        <Area type="monotone" dataKey={metric} connectNulls={false} name={metric === "sound_dbfs" ? "Nível equivalente (Leq)" : labelFor(metric)} stroke={color} strokeWidth={2} fill={`url(#fill-${metric})`} dot={{ r: 3, strokeWidth: 0, fill: color }} />
        {metric === "sound_dbfs" && (
          <Area type="monotone" dataKey="sound_max_dbfs" name="Máximo" stroke={color} strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AllMetricsChart({ data, showSound = true }: { data: HistoryPoint[]; showSound?: boolean }) {
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
        <YAxis yAxisId="left" stroke="#8792a2" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={30} />
        {/* dBFS is a negative scale (-96..0), so it gets its own right-hand axis. */}
        {showSound && (
          <YAxis yAxisId="sound" orientation="right" domain={[-96, 0]} stroke="#8792a2" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={34} />
        )}
        <Tooltip
          contentStyle={{ background: "#10151d", border: "1px solid #1f2732", borderRadius: 10, fontSize: 12 }}
          labelFormatter={(v) => formatDateTime(String(v))}
        />
        {/* null values (e.g. VOC while the sensor warms up) leave a gap — connectNulls stays off. */}
        <Line yAxisId="left" type="monotone" dataKey="temperature" stroke={METRIC_COLOR.temperature} strokeWidth={1.5} dot={false} connectNulls={false} name="Temperatura" />
        <Line yAxisId="left" type="monotone" dataKey="humidity" stroke={METRIC_COLOR.humidity} strokeWidth={1.5} dot={false} connectNulls={false} name="Humidade" />
        <Line yAxisId="left" type="monotone" dataKey="voc" stroke={METRIC_COLOR.voc} strokeWidth={1.5} dot={false} connectNulls={false} name="Índice VOC" />
        {showSound && (
          <Line yAxisId="sound" type="monotone" dataKey="sound_dbfs" stroke={METRIC_COLOR.sound_dbfs} strokeWidth={1.5} dot={false} name="Som (dBFS)" />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function labelFor(metric: ChartMetric) {
  if (metric === "temperature") return "Temperatura";
  if (metric === "humidity") return "Humidade";
  if (metric === "sound_dbfs") return "Nível de ruído relativo";
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
    temperature: avgOrNull(points.map((p) => p.temperature)),
    humidity: avgOrNull(points.map((p) => p.humidity)),
    voc: avgOrNull(points.map((p) => p.voc)),
    sound_dbfs: avgOrNull(points.map((p) => p.sound_dbfs)),
    sound_max_dbfs: maxOrNull(points.map((p) => p.sound_max_dbfs)),
    sound_loud_seconds: sumOrNull(points.map((p) => p.sound_loud_seconds))
  }));
}

function maxOrNull(nums: (number | null | undefined)[]) {
  const present = nums.filter((n): n is number => typeof n === "number");
  return present.length ? Math.max(...present) : null;
}

function sumOrNull(nums: (number | null | undefined)[]) {
  const present = nums.filter((n): n is number => typeof n === "number");
  return present.length ? present.reduce((s, n) => s + n, 0) : null;
}

function avgOrNull(nums: (number | null | undefined)[]) {
  const present = nums.filter((n): n is number => typeof n === "number");
  return present.length ? avg(present) : null;
}

function avg(nums: number[]) {
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}

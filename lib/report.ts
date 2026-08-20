import { HistoryPoint, Metric } from "./types";

export type BreachSegment = {
  start: string;
  end: string;
  hours: number;
  peak: number;
};

// Groups consecutive hourly points where `metric` exceeds `threshold` into
// contiguous segments — this is the literal evidence format from the pilot
// use case: "humidity was above 70% for N consecutive hours".
export function computeBreachSegments(history: HistoryPoint[], metric: Metric, threshold: number): BreachSegment[] {
  const segments: BreachSegment[] = [];
  let current: BreachSegment | null = null;

  for (const point of history) {
    const value = point[metric];
    if (value > threshold) {
      if (!current) {
        current = { start: point.timestamp, end: point.timestamp, hours: 1, peak: value };
      } else {
        current.end = point.timestamp;
        current.hours += 1;
        current.peak = Math.max(current.peak, value);
      }
    } else if (current) {
      segments.push(current);
      current = null;
    }
  }
  if (current) segments.push(current);
  return segments;
}

export const METRIC_THRESHOLD: Record<Metric, number> = {
  humidity: 70,
  voc: 120,
  temperature: 30
};

export const METRIC_LABEL: Record<Metric, string> = {
  temperature: "Temperatura",
  humidity: "Humidade",
  voc: "Índice VOC"
};

export const METRIC_UNIT: Record<Metric, string> = {
  temperature: "°C",
  humidity: "%",
  voc: ""
};

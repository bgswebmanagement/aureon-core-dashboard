// Helpers for sensor values that can be missing (null). The VOC sensor in
// particular is omitted by the firmware while it warms up.

export const VOC_WARMING_UP_LABEL = "a aquecer";

// Value + unit, or "—" when there is no value.
export function formatReading(value: number | null | undefined, unit = ""): string {
  return value == null ? "—" : `${value}${unit}`;
}

// True only for a real value above the threshold (null is never "above").
export function isAbove(value: number | null | undefined, threshold: number): boolean {
  return value != null && value > threshold;
}

// Average of the non-null values; null when there are none.
export function averageOrNull(values: (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => typeof v === "number");
  return present.length ? present.reduce((s, v) => s + v, 0) / present.length : null;
}

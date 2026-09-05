import { Severity, Status } from "./types";

export function statusLabel(status: Status): string {
  if (status === "critico") return "Crítico";
  if (status === "atencao") return "Atenção";
  return "Normal";
}

export function statusColor(status: Status): string {
  if (status === "critico") return "text-crit border-crit/40 bg-crit/10";
  if (status === "atencao") return "text-warn border-warn/40 bg-warn/10";
  return "text-good border-good/40 bg-good/10";
}

export function statusDot(status: Status): string {
  if (status === "critico") return "bg-crit";
  if (status === "atencao") return "bg-warn";
  return "bg-good";
}

export function severityLabel(sev: Severity): string {
  if (sev === "critico") return "Crítico";
  if (sev === "aviso") return "Aviso";
  return "Informativo";
}

export function severityColor(sev: Severity): string {
  if (sev === "critico") return "text-crit border-crit/40 bg-crit/10";
  if (sev === "aviso") return "text-warn border-warn/40 bg-warn/10";
  return "text-accent border-accent/40 bg-accent/10";
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export function relativeTime(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return "há menos de 1h";
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days > 1 ? "s" : ""}`;
}

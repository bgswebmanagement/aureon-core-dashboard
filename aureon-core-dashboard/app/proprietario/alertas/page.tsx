import { TopBar } from "@/components/TopBar";
import { AlertCard } from "@/components/AlertCard";
import { StatCard } from "@/components/StatCard";
import { IconAlert } from "@/components/icons";
import { getAlerts, getProperties } from "@/lib/data";

export default async function AlertsPage() {
  const [alerts, properties] = await Promise.all([getAlerts(), getProperties()]);
  const active = alerts.filter((a) => a.active);
  const criticos = active.filter((a) => a.severity === "critico").length;
  const avisos = active.filter((a) => a.severity === "aviso").length;

  return (
    <>
      <TopBar title="Alertas" subtitle={`${active.length} alertas ativos`} role="Proprietário" alertCount={active.length} />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard icon={<IconAlert className="h-5 w-5" />} value={criticos} label="Críticos" tone="crit" />
          <StatCard icon={<IconAlert className="h-5 w-5" />} value={avisos} label="Avisos" tone="warn" />
          <StatCard icon={<IconAlert className="h-5 w-5" />} value={active.length} label="Total Ativos" tone="accent" />
        </div>

        <div className="space-y-3">
          {active.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              propertyName={properties.find((p) => p.id === alert.propertyId)?.name}
              deviceLabel={alert.deviceLabel}
            />
          ))}
          {active.length === 0 && <div className="rounded-xl border border-border bg-panel p-6 text-center text-muted">Sem alertas ativos.</div>}
        </div>
      </div>
    </>
  );
}

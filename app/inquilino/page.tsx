import { TopBar } from "@/components/TopBar";
import { StatCard } from "@/components/StatCard";
import { HubCard } from "@/components/HubCard";
import { SatelliteCard } from "@/components/SatelliteCard";
import { AlertCard } from "@/components/AlertCard";
import { IconAlert, IconDroplet, IconThermo, IconWind } from "@/components/icons";
import { requireTenantScope } from "@/lib/tenant/scope";
import { statusColor, statusLabel } from "@/lib/ui";
import { formatReading, VOC_WARMING_UP_LABEL } from "@/lib/readings";

export default async function TenantOverview() {
  const { data, property } = await requireTenantScope();
  if (!property) return null; // (o layout já mostra o ecrã de «sem casa»)
  const [hub, satellites, alerts] = await Promise.all([
    data.getHub(property.id),
    data.getSatellites(property.id),
    data.getAlerts(property.id)
  ]);
  const active = alerts.filter((a) => a.active);

  return (
    <>
      <TopBar title={property.name} subtitle={property.address} role="Inquilino" alertCount={active.length} />
      <div className="space-y-8 p-6">
        <div className="flex items-center justify-between">
          <span className={`rounded-full border px-3 py-1 text-sm ${statusColor(property.status)}`}>{statusLabel(property.status)}</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={<IconThermo className="h-5 w-5" />} value={formatReading(hub?.temperature, "°C")} label="Temperatura" tone="accent" />
          <StatCard icon={<IconDroplet className="h-5 w-5" />} value={formatReading(hub?.humidity, "%")} label="Humidade" tone="good" />
          <StatCard icon={<IconWind className="h-5 w-5" />} value={formatReading(hub?.voc)} label="Índice VOC" sublabel={hub && hub.voc == null ? VOC_WARMING_UP_LABEL : undefined} tone="default" />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Dispositivos</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {hub && <HubCard hub={hub} />}
            {satellites.map((s) => (
              <SatelliteCard key={s.id} satellite={s} />
            ))}
          </div>
        </section>

        {active.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <IconAlert className="h-4 w-4" /> Alertas Ativos
            </h2>
            <div className="space-y-3">
              {active.map((alert) => (
                <AlertCard key={alert.id} alert={alert} deviceLabel={alert.deviceLabel} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

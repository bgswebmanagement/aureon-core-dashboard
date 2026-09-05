import { TopBar } from "@/components/TopBar";
import { StatCard } from "@/components/StatCard";
import { HubCard } from "@/components/HubCard";
import { SatelliteCard } from "@/components/SatelliteCard";
import { AlertCard } from "@/components/AlertCard";
import { IconAlert, IconDroplet, IconThermo, IconWind } from "@/components/icons";
import { getAlerts, getHub, getProperty, getSatellites, getTenantByProperty } from "@/lib/data";
import { statusColor, statusLabel } from "@/lib/ui";
import { DEMO_TENANT_PROPERTY_ID } from "@/lib/tenant";

export default async function TenantOverview() {
  const property = await getProperty(DEMO_TENANT_PROPERTY_ID);
  if (!property) return null;
  const [hub, satellites, alerts, tenant] = await Promise.all([
    getHub(property.id),
    getSatellites(property.id),
    getAlerts(property.id),
    getTenantByProperty(property.id)
  ]);
  const active = alerts.filter((a) => a.active);

  return (
    <>
      <TopBar title={property.name} subtitle={property.address} role="Inquilino" alertCount={active.length} />
      <div className="space-y-8 p-6">
        <div className="rounded-xl border border-border bg-panel2 p-3 text-xs text-muted">
          Vista de demonstração — {tenant?.name}. Cada inquilino real veria apenas os dados da sua própria habitação
          (aplicado por Row Level Security no Supabase).
        </div>

        <div className="flex items-center justify-between">
          <span className={`rounded-full border px-3 py-1 text-sm ${statusColor(property.status)}`}>{statusLabel(property.status)}</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={<IconThermo className="h-5 w-5" />} value={hub ? `${hub.temperature}°C` : "—"} label="Temperatura" tone="accent" />
          <StatCard icon={<IconDroplet className="h-5 w-5" />} value={hub ? `${hub.humidity}%` : "—"} label="Humidade" tone="good" />
          <StatCard icon={<IconWind className="h-5 w-5" />} value={hub ? hub.voc : "—"} label="Índice VOC" tone="default" />
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

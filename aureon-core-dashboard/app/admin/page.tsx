import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { StatCard } from "@/components/StatCard";
import { PropertyCard } from "@/components/PropertyCard";
import { AlertCard } from "@/components/AlertCard";
import { IconAlert, IconBuilding, IconDroplet, IconThermo, IconWind } from "@/components/icons";
import { getAlerts, getFleetHealth, getHub, getOverviewStats, getProperties, getSatellites, getTenantByProperty } from "@/lib/data";

export default async function AdminOverview() {
  const [stats, fleet, properties, alerts] = await Promise.all([
    getOverviewStats(),
    getFleetHealth(),
    getProperties(),
    getAlerts()
  ]);
  const activeAlerts = alerts.filter((a) => a.active);
  const criticalAlerts = activeAlerts.filter((a) => a.severity === "critico");

  const propertyRows = await Promise.all(
    properties.map(async (p) => ({
      property: p,
      hub: await getHub(p.id),
      satellites: await getSatellites(p.id),
      tenant: await getTenantByProperty(p.id),
      activeAlerts: activeAlerts.filter((a) => a.propertyId === p.id).length
    }))
  );

  return (
    <>
      <TopBar
        title="Aureon Core — Operações"
        subtitle={`Acesso interno · ${stats.totalProperties} propriedades · ${stats.totalHubs} hubs · ${stats.totalSatellites} satélites`}
        role="Aureon Core"
        alertCount={activeAlerts.length}
      />

      <div className="space-y-8 p-6">
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-muted">
          Esta é a vista interna da Aureon Core — sem restrições de consentimento do inquilino (o mesmo nível de
          acesso que já tem hoje através do Table Editor do Supabase). Não está ligada a partir da página
          pública; só é acedida por URL direto.
        </div>

        {criticalAlerts.length > 0 && (
          <Link
            href="/admin/alertas"
            className="flex items-center gap-2 rounded-xl border border-crit/40 bg-crit/10 px-4 py-2 text-sm text-crit"
          >
            <IconAlert className="h-4 w-4" /> {criticalAlerts.length} alerta{criticalAlerts.length > 1 ? "s" : ""} crítico
            {criticalAlerts.length > 1 ? "s" : ""} — ver detalhes
          </Link>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard icon={<IconThermo className="h-5 w-5" />} value={`${stats.avgTemp}°C`} label="Temperatura Média" sublabel="Todos os hubs" tone="accent" />
          <StatCard icon={<IconDroplet className="h-5 w-5" />} value={`${stats.avgHumidity}%`} label="Humidade Média" tone="good" />
          <StatCard icon={<IconWind className="h-5 w-5" />} value={stats.avgVoc} label="Índice VOC Médio" tone="default" />
          <StatCard
            icon={<IconAlert className="h-5 w-5" />}
            value={stats.propertiesWithAlerts}
            label="Propriedades c/ Alertas"
            sublabel={`de ${stats.totalProperties} propriedades`}
            tone="warn"
          />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Estado da Frota (Hardware)</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard icon={<IconBuilding className="h-5 w-5" />} value={fleet.totalHubs} label="Hubs" sublabel={`${fleet.hubsOffline} offline`} tone={fleet.hubsOffline > 0 ? "warn" : "good"} />
            <StatCard icon={<IconBuilding className="h-5 w-5" />} value={fleet.totalSatellites} label="Satélites" sublabel={`${fleet.satellitesOffline} offline`} tone={fleet.satellitesOffline > 0 ? "warn" : "good"} />
            <StatCard icon={<IconAlert className="h-5 w-5" />} value={fleet.satellitesLowBattery} label="Bateria Baixa" sublabel="< 30%" tone={fleet.satellitesLowBattery > 0 ? "warn" : "good"} />
            <StatCard icon={<IconAlert className="h-5 w-5" />} value={criticalAlerts.length} label="Alertas Críticos" tone={criticalAlerts.length > 0 ? "crit" : "good"} />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Propriedades</h2>
            <Link href="/admin/propriedades" className="text-xs text-accent hover:underline">
              Ver tudo
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {propertyRows.map(({ property, hub, satellites, tenant, activeAlerts }) => (
              <PropertyCard
                key={property.id}
                property={property}
                hub={hub}
                satellites={satellites}
                tenant={tenant}
                activeAlerts={activeAlerts}
                href={`/admin/propriedades/${property.id}`}
              />
            ))}
          </div>
        </section>

        {activeAlerts.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <IconAlert className="h-4 w-4" /> Alertas Ativos (todas as propriedades)
            </h2>
            <div className="space-y-3">
              {activeAlerts.slice(0, 8).map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  propertyName={properties.find((p) => p.id === alert.propertyId)?.name}
                  deviceLabel={alert.deviceLabel}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

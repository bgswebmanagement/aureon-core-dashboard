import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { StatCard } from "@/components/StatCard";
import { PropertyCard } from "@/components/PropertyCard";
import { HubCard } from "@/components/HubCard";
import { SatelliteCard } from "@/components/SatelliteCard";
import { IconAlert, IconBuilding, IconDroplet, IconThermo } from "@/components/icons";
import { formatReading } from "@/lib/readings";
import { requireOwnerScope } from "@/lib/owner/scope";

export default async function OwnerOverview() {
  const { data } = await requireOwnerScope();
  const [stats, properties, alerts] = await Promise.all([data.getOverviewStats(), data.getProperties(), data.getAlerts()]);
  const activeAlerts = alerts.filter((a) => a.active);
  const criticalAlert = activeAlerts.find((a) => a.severity === "critico");

  const propertyRows = await Promise.all(
    properties.map(async (p) => ({
      property: p,
      hub: await data.getHub(p.id),
      satellites: await data.getSatellites(p.id),
      consentGrants: await data.getConsentGrants(p.id),
      tenant: await data.getTenantByProperty(p.id),
      activeAlerts: activeAlerts.filter((a) => a.propertyId === p.id).length
    }))
  );

  const firstProperty = propertyRows[0];

  return (
    <>
      <TopBar
        title="Painel de Gestão"
        subtitle={`${stats.totalProperties} propriedades · ${stats.totalHubs} hubs · ${stats.totalSatellites} satélites`}
        role="Proprietário"
        alertCount={activeAlerts.length}
      />

      <div className="space-y-8 p-6">
        {criticalAlert && (
          <Link
            href="/proprietario/alertas"
            className="flex items-center gap-2 rounded-xl border border-crit/40 bg-crit/10 px-4 py-2 text-sm text-crit"
          >
            <IconAlert className="h-4 w-4" /> {stats.criticalAlerts} alerta crítico — ver detalhes
          </Link>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard icon={<IconThermo className="h-5 w-5" />} value={formatReading(stats.avgTemp, "°C")} label="Temperatura Média" sublabel="Todos os hubs" tone="accent" />
          <StatCard icon={<IconDroplet className="h-5 w-5" />} value={formatReading(stats.avgHumidity, "%")} label="Humidade Média" sublabel="Dentro do normal" tone="good" />
          <StatCard icon={<IconBuilding className="h-5 w-5" />} value={formatReading(stats.avgVoc)} label="Índice VOC Médio" sublabel="Relativo ao local" tone="default" />
          <StatCard
            icon={<IconAlert className="h-5 w-5" />}
            value={stats.propertiesWithAlerts}
            label="Propriedades c/ Alertas"
            sublabel={`de ${stats.totalProperties} propriedades`}
            tone="warn"
          />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Propriedades</h2>
            <Link href="/proprietario/propriedades" className="text-xs text-accent hover:underline">
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
                href={`/proprietario/propriedades/${property.id}`}
              />
            ))}
          </div>
        </section>

        {firstProperty && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {firstProperty.property.name.toUpperCase()} — DISPOSITIVOS
              </h2>
              <Link href={`/proprietario/propriedades/${firstProperty.property.id}`} className="text-xs text-accent hover:underline">
                Ver tudo
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {firstProperty.hub && <HubCard hub={firstProperty.hub} viewerRole="owner" consentGrants={firstProperty.consentGrants} />}
              {firstProperty.satellites.map((s) => (
                <SatelliteCard key={s.id} satellite={s} viewerRole="owner" consentGrants={firstProperty.consentGrants} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

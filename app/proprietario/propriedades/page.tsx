import { TopBar } from "@/components/TopBar";
import { StatCard } from "@/components/StatCard";
import { PropertyCard } from "@/components/PropertyCard";
import { IconBuilding } from "@/components/icons";
import { requireOwnerScope } from "@/lib/owner/scope";

export default async function PropertiesPage() {
  const { data } = await requireOwnerScope();
  const [properties, alerts] = await Promise.all([data.getProperties(), data.getAlerts()]);
  const activeAlerts = alerts.filter((a) => a.active);
  const withAlerts = properties.filter((p) => p.status !== "normal").length;

  const rows = await Promise.all(
    properties.map(async (p) => ({
      property: p,
      hub: await data.getHub(p.id),
      satellites: await data.getSatellites(p.id),
      tenant: await data.getTenantByProperty(p.id),
      activeAlerts: activeAlerts.filter((a) => a.propertyId === p.id).length
    }))
  );

  return (
    <>
      <TopBar title="Propriedades" subtitle={`${properties.length} propriedades ativas`} role="Proprietário" alertCount={activeAlerts.length} />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={<IconBuilding className="h-5 w-5" />} value={properties.length} label="Total" tone="accent" />
          <StatCard icon={<IconBuilding className="h-5 w-5" />} value={withAlerts} label="Com Alertas" tone="warn" />
          <StatCard icon={<IconBuilding className="h-5 w-5" />} value={properties.length - withAlerts} label="Normais" tone="good" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ property, hub, satellites, tenant, activeAlerts }) => (
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
      </div>
    </>
  );
}

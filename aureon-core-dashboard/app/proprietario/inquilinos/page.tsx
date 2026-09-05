import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { statusColor, statusLabel } from "@/lib/ui";
import { IconAlert } from "@/components/icons";
import { getAlerts, getProperties, getSatellites, getTenants } from "@/lib/data";

export default async function TenantsPage() {
  const [tenants, properties, alerts] = await Promise.all([getTenants(), getProperties(), getAlerts()]);
  const activeAlerts = alerts.filter((a) => a.active);

  const rows = await Promise.all(
    tenants.map(async (tenant) => {
      const property = properties.find((p) => p.id === tenant.propertyId);
      if (!property) return null;
      const satellites = await getSatellites(property.id);
      const tenantAlerts = activeAlerts.filter((a) => a.propertyId === property.id);
      return { tenant, property, satelliteCount: satellites.length, tenantAlerts };
    })
  );

  return (
    <>
      <TopBar title="Inquilinos" subtitle={`${tenants.length} inquilinos ativos`} role="Proprietário" alertCount={activeAlerts.length} />
      <div className="space-y-4 p-6">
        {rows.filter((r): r is NonNullable<typeof r> => r !== null).map(({ tenant, property, satelliteCount, tenantAlerts }) => (
          <Link
            key={tenant.id}
            href={`/proprietario/propriedades/${property.id}`}
            className="block rounded-xl border border-border bg-panel p-5 transition-colors hover:border-accent/40"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{tenant.name}</div>
                <div className="mt-1 text-sm text-muted">{tenant.email}</div>
                <div className="mt-1 text-sm text-muted">{property.name}</div>
              </div>
              {tenantAlerts.length > 0 ? (
                <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${statusColor(property.status)}`}>
                  <IconAlert className="h-3.5 w-3.5" />
                  {tenantAlerts.length} alerta{tenantAlerts.length > 1 ? "s" : ""}
                </span>
              ) : (
                <span className={`rounded-full border px-2.5 py-0.5 text-xs ${statusColor(property.status)}`}>Sem alertas</span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4 text-center text-sm">
              <div>
                <div className="text-xl font-bold">{satelliteCount}</div>
                <div className="text-xs text-muted">Satélites</div>
              </div>
              <div>
                <div className={`text-xl font-bold ${statusColor(property.status).split(" ")[0]}`}>{statusLabel(property.status)}</div>
                <div className="text-xs text-muted">Estado</div>
              </div>
              <div>
                <div className="text-xl font-bold">{tenantAlerts.length}</div>
                <div className="text-xs text-muted">Alertas Ativos</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { HubCard } from "@/components/HubCard";
import { SatelliteCard } from "@/components/SatelliteCard";
import { AlertCard } from "@/components/AlertCard";
import { IconDownload } from "@/components/icons";
import { statusColor, statusLabel } from "@/lib/ui";
import { getAlerts, getConsentGrants, getHub, getProperty, getSatellites, getTenantByProperty } from "@/lib/data";
import { ViewerRole } from "@/lib/types";

// Shared single-property detail view used by both the owner dashboard
// (/proprietario/propriedades/[id], restricted per tenant consent) and the
// Aureon Core admin dashboard (/admin/propriedades/[id], unrestricted).
export async function PropertyDetailView({
  propertyId,
  viewerRole,
  role
}: {
  propertyId: string;
  viewerRole: ViewerRole;
  role: "Proprietário" | "Aureon Core";
}) {
  const property = await getProperty(propertyId);
  if (!property) notFound();

  const [hub, satellites, consentGrants, tenant, alerts, allAlerts] = await Promise.all([
    getHub(property.id),
    getSatellites(property.id),
    getConsentGrants(property.id),
    getTenantByProperty(property.id),
    getAlerts(property.id),
    getAlerts()
  ]);

  return (
    <>
      <TopBar
        title={property.name}
        subtitle={`${property.address} — ${property.city}`}
        role={role}
        alertCount={allAlerts.filter((a) => a.active).length}
      />
      <div className="space-y-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-sm ${statusColor(property.status)}`}>{statusLabel(property.status)}</span>
            {tenant && <span className="text-sm text-muted">Inquilino: {tenant.name}</span>}
            <span className="text-sm text-muted">Hub: {property.hubId}</span>
          </div>
          <Link
            href={`/report/${property.id}`}
            target="_blank"
            className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-1.5 text-sm hover:border-accent/50"
          >
            <IconDownload className="h-4 w-4" /> Gerar Relatório (Disputa)
          </Link>
        </div>

        {viewerRole === "owner" && (
          <div className="rounded-xl border border-border bg-panel2 p-3 text-xs text-muted">
            Movimento e porta/janela só ficam visíveis aqui depois do inquilino autorizar — ver secção{" "}
            <span className="text-white">Satélites</span> abaixo. Fugas de água e condições do hub (temperatura,
            humidade, qualidade do ar) estão sempre visíveis.
          </div>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Hub</h2>
          {hub ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <HubCard hub={hub} />
            </div>
          ) : (
            <div className="text-sm text-muted">Hub não encontrado.</div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Satélites ({satellites.length})</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {satellites.map((s) => (
              <SatelliteCard key={s.id} satellite={s} viewerRole={viewerRole} consentGrants={consentGrants} />
            ))}
            {satellites.length === 0 && <div className="text-sm text-muted">Sem satélites associados.</div>}
          </div>
        </section>

        {alerts.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Alertas desta propriedade</h2>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} deviceLabel={alert.deviceLabel} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

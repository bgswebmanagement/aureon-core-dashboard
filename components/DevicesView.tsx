import { TopBar } from "@/components/TopBar";
import { HubCard } from "@/components/HubCard";
import { SatelliteCard } from "@/components/SatelliteCard";
import { getAlerts, getConsentGrants, getHub, getProperties, getSatellites } from "@/lib/data";
import { ViewerRole } from "@/lib/types";

// Shared "all devices, grouped by property" view used by both the owner
// dashboard (/proprietario/dispositivos, restricted per consent) and the
// Aureon Core admin dashboard (/admin/dispositivos, unrestricted — same
// access level admin staff already have via the Supabase table editor).
export async function DevicesView({
  viewerRole,
  role
}: {
  viewerRole: ViewerRole;
  role: "Proprietário" | "Inquilino" | "Aureon Core";
}) {
  const [properties, alerts] = await Promise.all([getProperties(), getAlerts()]);
  const activeAlerts = alerts.filter((a) => a.active);

  const rows = await Promise.all(
    properties.map(async (p) => ({
      property: p,
      hub: await getHub(p.id),
      satellites: await getSatellites(p.id),
      consentGrants: await getConsentGrants(p.id)
    }))
  );

  const totalSatellites = rows.reduce((s, r) => s + r.satellites.length, 0);

  return (
    <>
      <TopBar
        title="Dispositivos"
        subtitle={`${rows.length} hubs · ${totalSatellites} satélites em ${properties.length} propriedades`}
        role={role}
        alertCount={activeAlerts.length}
      />
      <div className="space-y-8 p-6">
        {rows.map(({ property, hub, satellites, consentGrants }) => (
          <section key={property.id}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{property.name}</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {hub && <HubCard hub={hub} />}
              {satellites.map((s) => (
                <SatelliteCard key={s.id} satellite={s} viewerRole={viewerRole} consentGrants={consentGrants} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

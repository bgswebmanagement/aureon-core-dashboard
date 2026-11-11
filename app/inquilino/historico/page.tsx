import { TopBar } from "@/components/TopBar";
import { HistoryClient } from "@/components/HistoryClient";
import { requireTenantScope } from "@/lib/tenant/scope";

export default async function TenantHistoryPage() {
  const { data, property } = await requireTenantScope();
  if (!property) return null; // (o layout já mostra o ecrã de «sem casa»)

  const [alerts, history, events] = await Promise.all([
    data.getAlerts(property.id),
    data.getHistory(property.id, 14),
    data.getSatelliteEvents(property.id, 14)
  ]);

  return (
    <>
      <TopBar title="Histórico" subtitle="14 dias de dados do hub" role="Inquilino" alertCount={alerts.filter((a) => a.active).length} />
      <HistoryClient
        properties={[property]}
        historyByProperty={{ [property.id]: history }}
        satelliteEventsByProperty={{ [property.id]: events }}
        viewerRole="tenant"
        initialPropertyId={property.id}
      />
    </>
  );
}

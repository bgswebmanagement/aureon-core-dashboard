import { TopBar } from "@/components/TopBar";
import { HistoryClient } from "@/components/HistoryClient";
import { getAlerts, getHistory, getProperty, getSatelliteEvents } from "@/lib/data";
import { DEMO_TENANT_PROPERTY_ID } from "@/lib/tenant";

export default async function TenantHistoryPage() {
  const property = await getProperty(DEMO_TENANT_PROPERTY_ID);
  if (!property) return null;

  const [alerts, history, events] = await Promise.all([
    getAlerts(property.id),
    getHistory(property.id, 14),
    getSatelliteEvents(property.id, 14)
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

import { TopBar } from "@/components/TopBar";
import { HistoryClient } from "@/components/HistoryClient";
import { getAlerts, getConsentGrants, getHistory, getProperties, getSatelliteEvents } from "@/lib/data";

export default async function OwnerHistoryPage({ searchParams }: { searchParams: { property?: string } }) {
  const [properties, alerts] = await Promise.all([getProperties(), getAlerts()]);
  const initialProperty = properties.find((p) => p.id === searchParams.property) ?? properties[0];

  const historyEntries = await Promise.all(properties.map(async (p) => [p.id, await getHistory(p.id, 14)] as const));
  const historyByProperty = Object.fromEntries(historyEntries);

  const eventEntries = await Promise.all(properties.map(async (p) => [p.id, await getSatelliteEvents(p.id, 14)] as const));
  const satelliteEventsByProperty = Object.fromEntries(eventEntries);

  const grantEntries = await Promise.all(properties.map(async (p) => [p.id, await getConsentGrants(p.id)] as const));
  const consentGrantsByProperty = Object.fromEntries(grantEntries);

  return (
    <>
      <TopBar title="Histórico" subtitle="14 dias de dados do hub, por propriedade" role="Proprietário" alertCount={alerts.filter((a) => a.active).length} />
      <HistoryClient
        properties={properties}
        historyByProperty={historyByProperty}
        satelliteEventsByProperty={satelliteEventsByProperty}
        consentGrantsByProperty={consentGrantsByProperty}
        viewerRole="owner"
        initialPropertyId={initialProperty.id}
      />
    </>
  );
}

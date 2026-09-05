import { TopBar } from "@/components/TopBar";
import { AlertCard } from "@/components/AlertCard";
import { getAlerts } from "@/lib/data";
import { DEMO_TENANT_PROPERTY_ID } from "@/lib/tenant";

export default async function TenantAlertsPage() {
  const alerts = await getAlerts(DEMO_TENANT_PROPERTY_ID);
  const active = alerts.filter((a) => a.active);

  return (
    <>
      <TopBar title="Alertas" subtitle={`${active.length} alertas ativos`} role="Inquilino" alertCount={active.length} />
      <div className="space-y-3 p-6">
        {active.map((alert) => (
          <AlertCard key={alert.id} alert={alert} deviceLabel={alert.deviceLabel} />
        ))}
        {active.length === 0 && <div className="rounded-xl border border-border bg-panel p-6 text-center text-muted">Sem alertas ativos.</div>}
      </div>
    </>
  );
}

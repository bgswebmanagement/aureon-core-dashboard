import { TopBar } from "@/components/TopBar";
import { AlertCard } from "@/components/AlertCard";
import { requireTenantScope } from "@/lib/tenant/scope";

export default async function TenantAlertsPage() {
  const { data, property } = await requireTenantScope();
  if (!property) return null; // (o layout já mostra o ecrã de «sem casa»)
  const alerts = await data.getAlerts(property.id);
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

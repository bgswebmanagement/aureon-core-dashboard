import { TopBar } from "@/components/TopBar";
import { InsightCard } from "@/components/AlertCard";
import { requireTenantScope } from "@/lib/tenant/scope";

export default async function TenantInsightsPage() {
  const { data, property } = await requireTenantScope();
  if (!property) return null; // (o layout já mostra o ecrã de «sem casa»)
  const [insights, alerts] = await Promise.all([data.getInsights(property.id), data.getAlerts(property.id)]);

  return (
    <>
      <TopBar title="Insights" subtitle="Recomendações para a sua habitação" role="Inquilino" alertCount={alerts.filter((a) => a.active).length} />
      <div className="space-y-3 p-6">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
        {insights.length === 0 && <div className="rounded-xl border border-border bg-panel p-6 text-center text-muted">Sem recomendações no momento.</div>}
      </div>
    </>
  );
}

import { TopBar } from "@/components/TopBar";
import { InsightCard } from "@/components/AlertCard";
import { getAlerts, getInsights } from "@/lib/data";
import { DEMO_TENANT_PROPERTY_ID } from "@/lib/tenant";

export default async function TenantInsightsPage() {
  const [insights, alerts] = await Promise.all([getInsights(DEMO_TENANT_PROPERTY_ID), getAlerts(DEMO_TENANT_PROPERTY_ID)]);

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

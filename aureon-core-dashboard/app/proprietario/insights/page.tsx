import { TopBar } from "@/components/TopBar";
import { InsightCard } from "@/components/AlertCard";
import { StatCard } from "@/components/StatCard";
import { IconBulb } from "@/components/icons";
import { getAlerts, getInsights } from "@/lib/data";

export default async function InsightsPage() {
  const [insights, alerts] = await Promise.all([getInsights(), getAlerts()]);
  const criticos = insights.filter((i) => i.severity === "critico").length;
  const avisos = insights.filter((i) => i.severity === "aviso").length;
  const informativos = insights.filter((i) => i.severity === "informativo").length;

  return (
    <>
      <TopBar title="Insights" subtitle="Recomendações baseadas nos padrões de dados dos sensores" role="Proprietário" alertCount={alerts.filter((a) => a.active).length} />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={<IconBulb className="h-5 w-5" />} value={criticos} label="Críticos" tone="crit" />
          <StatCard icon={<IconBulb className="h-5 w-5" />} value={avisos} label="Avisos" tone="warn" />
          <StatCard icon={<IconBulb className="h-5 w-5" />} value={informativos} label="Informativos" tone="accent" />
        </div>

        {(["critico", "aviso", "informativo"] as const).map((sev) => {
          const items = insights.filter((i) => i.severity === sev);
          if (items.length === 0) return null;
          return (
            <section key={sev}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                {sev === "critico" ? "Críticos" : sev === "aviso" ? "Avisos" : "Informativos"}
              </h2>
              <div className="space-y-3">
                {items.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

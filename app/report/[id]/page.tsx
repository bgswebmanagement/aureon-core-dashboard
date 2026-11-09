import { redirect } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { DataError } from "@/components/DataError";
import type { DataReader } from "@/lib/data";
import { REPORT_DENIED_URL, requireReportReader } from "@/lib/report-scope";
import { formatReading, isAbove } from "@/lib/readings";
import { computeBreachSegments, METRIC_LABEL, METRIC_THRESHOLD, METRIC_UNIT } from "@/lib/report";
import { formatDateTime } from "@/lib/ui";
import { filterEventsForViewer } from "@/lib/consent";
import { Metric } from "@/lib/types";

const EVENT_LABEL: Record<string, string> = {
  leak: "Fuga de água",
  motion: "Movimento",
  doorWindow: "Porta/Janela"
};

// Só com sessão e nunca da cache de dados: o relatório mostra dados de uma casa.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function readReport(data: DataReader, propertyId: string, days: number) {
  const [hub, satellites, tenant, consentGrants, history, allEvents] = await Promise.all([
    data.getHub(propertyId),
    data.getSatellites(propertyId),
    data.getTenantByProperty(propertyId),
    data.getConsentGrants(propertyId),
    data.getHistory(propertyId, days),
    data.getSatelliteEvents(propertyId, days)
  ]);
  return { hub, satellites, tenant, consentGrants, history, allEvents };
}

export default async function ReportPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { metric?: string; days?: string };
}) {
  const data = await requireReportReader();
  const days = Math.min(30, Math.max(1, Number(searchParams.days) || 14));
  const focusMetric: Metric = (["temperature", "humidity", "voc"] as const).includes(searchParams.metric as Metric)
    ? (searchParams.metric as Metric)
    : "humidity";

  // Leituras num bloco só: se algo falhar mostra-se um erro claro (nunca
  // dados de demonstração). O redirect fica fora do try.
  let loaded;
  try {
    // Casa que não existe ou de que a pessoa não é membro: a mesma resposta.
    const property = await data.getProperty(params.id);
    loaded = property
      ? {
          property,
          ...(await readReport(data, property.id, days))
        }
      : null;
  } catch {
    return <DataError />;
  }
  if (!loaded) redirect(REPORT_DENIED_URL);
  const { property, hub, satellites, tenant, consentGrants, history, allEvents } = loaded;

  const threshold = METRIC_THRESHOLD[focusMetric];
  const segments = computeBreachSegments(history, focusMetric, threshold);
  // O relatório é o documento do DONO/agência (por exemplo, numa disputa), por
  // isso aplica sempre a restrição do dono — mesmo quando quem o abre é o
  // administrador ou o inquilino: fuga e dados do hub sempre; movimento e
  // porta/janela só com autorização do inquilino. Não diz quantos eventos
  // ficaram de fora (isso revelaria que existem).
  const events = filterEventsForViewer(allEvents, "owner", consentGrants);

  return (
    <div className="min-h-screen bg-white px-10 py-10 text-slate-900 print:px-0 print:py-0">
      <div className="no-print mb-6 flex justify-end">
        <PrintButton />
      </div>

      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-start justify-between border-b border-slate-300 pb-6">
          <div>
            <div className="text-lg font-bold">Aureon Core</div>
            <div className="text-sm text-slate-500">Relatório de Monitorização Ambiental</div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>Gerado em {formatDateTime(new Date().toISOString())}</div>
            <div>Período: últimos {days} dias</div>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-xs uppercase text-slate-400">Propriedade</div>
            <div className="font-semibold">{property.name}</div>
            <div className="text-slate-600">
              {property.address} — {property.city}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-slate-400">Inquilino / Hub</div>
            <div className="font-semibold">{tenant?.name ?? "—"}</div>
            <div className="text-slate-600">Hub: {property.hubId} {hub && `(${hub.location})`}</div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Leitura Atual do Hub</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-400">
                <th className="py-1.5">Local</th>
                <th className="py-1.5 text-right">Temp.</th>
                <th className="py-1.5 text-right">Humidade</th>
                <th className="py-1.5 text-right">VOC</th>
                <th className="py-1.5 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {hub && (
                <tr className="border-b border-slate-200">
                  <td className="py-1.5">{hub.location}</td>
                  <td className="py-1.5 text-right">{formatReading(hub.temperature, "°C")}</td>
                  <td className={`py-1.5 text-right ${isAbove(hub.humidity, 70) ? "font-semibold text-amber-700" : ""}`}>{formatReading(hub.humidity, "%")}</td>
                  <td className={`py-1.5 text-right ${isAbove(hub.voc, 120) ? "font-semibold text-amber-700" : ""}`}>{formatReading(hub.voc)}</td>
                  <td className="py-1.5 text-right capitalize">{property.status}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Evidência Detalhada — {METRIC_LABEL[focusMetric]}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Limiar de referência: {threshold}
            {METRIC_UNIT[focusMetric]}. Períodos abaixo indicam intervalos contínuos em que a leitura do hub esteve
            acima deste limiar.
          </p>

          {segments.length === 0 ? (
            <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Nenhum período acima do limiar de referência no intervalo analisado.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-400">
                  <th className="py-1.5">Início</th>
                  <th className="py-1.5">Fim</th>
                  <th className="py-1.5 text-right">Duração</th>
                  <th className="py-1.5 text-right">Pico</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="py-1.5">{formatDateTime(s.start)}</td>
                    <td className="py-1.5">{formatDateTime(s.end)}</td>
                    <td className="py-1.5 text-right">{s.hours}h</td>
                    <td className="py-1.5 text-right font-semibold text-amber-700">
                      {s.peak}
                      {METRIC_UNIT[focusMetric]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Registo Horário Completo — Hub</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-left uppercase text-slate-400">
                <th className="py-1">Data / Hora</th>
                <th className="py-1 text-right">Temp.</th>
                <th className="py-1 text-right">Humidade</th>
                <th className="py-1 text-right">VOC</th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.timestamp} className="border-b border-slate-100">
                  <td className="py-0.5">{formatDateTime(p.timestamp)}</td>
                  <td className="py-0.5 text-right">{formatReading(p.temperature, "°C")}</td>
                  <td className={`py-0.5 text-right ${isAbove(p.humidity, 70) ? "font-semibold text-amber-700" : ""}`}>{formatReading(p.humidity, "%")}</td>
                  <td className={`py-0.5 text-right ${isAbove(p.voc, 120) ? "font-semibold text-amber-700" : ""}`}>{formatReading(p.voc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Eventos dos Satélites no Período ({events.length})
          </h2>
          {events.length === 0 ? (
            <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Nenhum evento registado.</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-left uppercase text-slate-400">
                  <th className="py-1">Data / Hora</th>
                  <th className="py-1">Satélite</th>
                  <th className="py-1">Evento</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-0.5">{formatDateTime(e.timestamp)}</td>
                    <td className="py-0.5">{e.satelliteLabel}</td>
                    <td className="py-0.5">{EVENT_LABEL[e.type]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mb-8 rounded border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
          Satélites: {satellites.map((s) => s.label).join(", ") || "nenhum associado"}.
        </section>

        <footer className="mt-10 border-t border-slate-300 pt-4 text-[11px] leading-relaxed text-slate-500">
          Este relatório é gerado automaticamente a partir dos dados registados pelo sistema Aureon Core instalado
          na propriedade acima identificada. O sistema encontra-se em fase de piloto (beta) e não substitui
          sistemas certificados de deteção de incêndio, monóxido de carbono ou segurança. Os dados destinam-se a
          fins de documentação e resolução de disputas, não constituindo parecer técnico ou jurídico.
        </footer>
      </div>
    </div>
  );
}

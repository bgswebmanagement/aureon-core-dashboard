import { TopBar } from "@/components/TopBar";
import { StatCard } from "@/components/StatCard";
import { IconLock, IconUnlock } from "@/components/icons";
import { formatDateTime } from "@/lib/ui";
import { getAlerts, getConsentGrants, getProperties } from "@/lib/data";
import { RestrictedCategory } from "@/lib/types";

const CATEGORY_LABEL: Record<RestrictedCategory, string> = {
  motion: "Movimento",
  doorWindow: "Porta/Janela"
};

// Fleet-wide view of every tenant consent grant — who authorized what, for
// which property, and why. This is read-only for Aureon Core: consent is
// tenant-controlled (see app/inquilino/privacidade), staff can only see the
// current state, not grant/revoke on a tenant's behalf.
export default async function AdminConsentsPage() {
  const [grants, properties, alerts] = await Promise.all([getConsentGrants(), getProperties(), getAlerts()]);
  const active = grants.filter((g) => g.active);

  return (
    <>
      <TopBar
        title="Consentimentos"
        subtitle="Autorizações dos inquilinos para dados restritos, por propriedade"
        role="Aureon Core"
        alertCount={alerts.filter((a) => a.active).length}
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard icon={<IconUnlock className="h-5 w-5" />} value={active.length} label="Ativos" tone="good" />
          <StatCard icon={<IconLock className="h-5 w-5" />} value={grants.length - active.length} label="Revogados" tone="default" />
          <StatCard icon={<IconLock className="h-5 w-5" />} value={grants.length} label="Total (histórico)" tone="accent" />
        </div>

        <div className="rounded-xl border border-border bg-panel2 p-3 text-xs text-muted">
          Só o inquilino pode autorizar ou revogar. Esta página é apenas de consulta — mostra o estado atual,
          não permite alterar consentimentos em nome de ninguém.
        </div>

        <div className="rounded-xl border border-border bg-panel">
          {grants.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">Nenhum consentimento registado ainda.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Propriedade</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Autorizado em</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => {
                  const property = properties.find((p) => p.id === g.propertyId);
                  return (
                    <tr key={g.id} className="border-t border-border/60">
                      <td className="px-4 py-2.5">{property?.name ?? g.propertyId}</td>
                      <td className="px-4 py-2.5">{CATEGORY_LABEL[g.category]}</td>
                      <td className="px-4 py-2.5">
                        {g.active ? (
                          <span className="flex items-center gap-1.5 text-good">
                            <IconUnlock className="h-3.5 w-3.5" /> Autorizado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-muted">
                            <IconLock className="h-3.5 w-3.5" /> Revogado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{g.reason ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted">{formatDateTime(g.grantedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

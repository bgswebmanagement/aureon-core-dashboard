import { TopBar } from "@/components/TopBar";
import { IconLock, IconShield } from "@/components/icons";
import { ConsentManager } from "@/components/ConsentManager";
import { getAlerts, getConsentGrants, getProperty, getSatellites, isLiveMode } from "@/lib/data";
import { DEMO_TENANT_PROPERTY_ID } from "@/lib/tenant";
import { RestrictedCategory } from "@/lib/types";

const ALL_RESTRICTED: RestrictedCategory[] = ["motion", "doorWindow"];

export default async function TenantPrivacyPage() {
  const property = await getProperty(DEMO_TENANT_PROPERTY_ID);
  if (!property) return null;

  const [satellites, grants, alerts] = await Promise.all([
    getSatellites(property.id),
    getConsentGrants(property.id),
    getAlerts(property.id)
  ]);

  // Only show a toggle for categories a satellite at this property can
  // actually produce — no point offering "door/window" consent if there's no
  // door/window satellite installed.
  const categories = ALL_RESTRICTED.filter((cat) => satellites.some((s) => s.capabilities.includes(cat)));

  return (
    <>
      <TopBar
        title="Privacidade"
        subtitle="Quem vê o quê sobre a sua habitação"
        role="Inquilino"
        alertCount={alerts.filter((a) => a.active).length}
      />
      <div className="space-y-6 p-6">
        <div className="rounded-xl border border-border bg-panel p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <IconShield className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Como funciona a privacidade na Aureon Core</div>
              <p className="mt-1 text-sm text-muted">
                Como inquilino, tem sempre acesso a todos os dados da sua habitação. O seu proprietário/agência
                só vê, por predefinição, o que é necessário para proteger o imóvel: temperatura, humidade,
                qualidade do ar e fugas de água. Dados de presença/atividade — movimento e abertura de
                portas/janelas — ficam ocultos do proprietário a menos que autorize explicitamente aqui em
                baixo, por exemplo para resolver uma disputa (ruído, acessos, etc.).
              </p>
            </div>
          </div>
        </div>

        {categories.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-panel p-5 text-sm text-muted">
            <IconLock className="h-4 w-4" /> Os satélites instalados na sua habitação não recolhem dados
            restritos (movimento ou porta/janela).
          </div>
        ) : (
          <ConsentManager propertyId={property.id} categories={categories} initialGrants={grants} isLiveMode={isLiveMode} />
        )}

        <div className="rounded-xl border border-border bg-panel2 p-3 text-xs text-muted">
          Fugas de água e as leituras do hub (temperatura, humidade, qualidade do ar) são sempre visíveis ao
          proprietário — são sinais de possível dano à propriedade, não de atividade pessoal, por isso não
          dependem de autorização.
        </div>
      </div>
    </>
  );
}

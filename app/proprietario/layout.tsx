import { Sidebar } from "@/components/Sidebar";
import { DataError } from "@/components/DataError";
import { IconBuilding } from "@/components/icons";
import { ownerNav } from "@/lib/nav";
import { requireOwnerScope } from "@/lib/owner/scope";

// Render on every request instead of caching as static HTML at build time —
// once Supabase is live, hub/satellite data changes continuously.
export const dynamic = "force-dynamic";
// Nada do que o dono lê pode vir da cache de dados do Next: cada pedido lê de
// novo, com a sessão de quem pede.
export const fetchCache = "force-no-store";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  // O layout NÃO protege as páginas por si só: cada página volta a chamar
  // requireOwnerScope().
  const { account, data } = await requireOwnerScope();

  let activeCount = 0;
  let hasProperties = true;
  let failed = false;
  try {
    const [alerts, properties] = await Promise.all([data.getAlerts(), data.getProperties()]);
    activeCount = alerts.filter((a) => a.active).length;
    hasProperties = properties.length > 0;
  } catch {
    failed = true;
  }

  return (
    <div className="flex">
      <Sidebar
        base="/proprietario"
        role="Proprietário"
        items={ownerNav("/proprietario")}
        alertCount={activeCount}
        account={account}
      />
      <div className="min-h-screen flex-1">
        {failed ? (
          <DataError />
        ) : hasProperties ? (
          children
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="max-w-md rounded-xl border border-border bg-panel p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-muted">
                <IconBuilding className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-lg font-semibold">Ainda não tem propriedades associadas</h1>
              <p className="mt-2 text-sm text-muted">
                A sua conta está ativa, mas ainda não tem nenhuma casa ligada. Contacte a Aureon Core para associar as suas propriedades.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

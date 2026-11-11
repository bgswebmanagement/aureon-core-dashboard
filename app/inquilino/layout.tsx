import { Sidebar } from "@/components/Sidebar";
import { DataError } from "@/components/DataError";
import { IconBuilding } from "@/components/icons";
import { tenantNav } from "@/lib/nav";
import { requireTenantScope } from "@/lib/tenant/scope";

// Render on every request instead of caching as static HTML at build time —
// once Supabase is live, hub/satellite data changes continuously.
export const dynamic = "force-dynamic";
// Nada do que o inquilino lê pode vir da cache de dados do Next: cada pedido lê
// de novo, com a sessão de quem pede.
export const fetchCache = "force-no-store";

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  // O layout NÃO protege as páginas por si só: cada página volta a chamar
  // requireTenantScope().
  const { account, data, property, totalProperties, failed } = await requireTenantScope();

  let activeCount = 0;
  let loadFailed = failed;
  if (property && !failed) {
    try {
      activeCount = (await data.getAlerts(property.id)).filter((a) => a.active).length;
    } catch {
      loadFailed = true;
    }
  }

  let content: React.ReactNode;
  if (loadFailed) {
    content = <DataError />;
  } else if (!property) {
    content = (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-panel p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-muted">
            <IconBuilding className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold">Ainda não tem uma habitação associada</h1>
          <p className="mt-2 text-sm text-muted">
            A sua conta está ativa, mas ainda não tem nenhuma casa ligada. Contacte a Aureon Core para associar a sua habitação.
          </p>
        </div>
      </div>
    );
  } else {
    content = (
      <>
        {/* O nome da casa fica sempre visível no topo, em todas as páginas. */}
        <div className="no-print border-b border-border bg-panel2 px-6 py-3" data-testid="casa-do-inquilino">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <IconBuilding className="h-5 w-5 text-accent" />
            <span className="text-base font-semibold">{property.name}</span>
            <span className="text-sm text-muted">
              {property.address} — {property.city}
            </span>
            {totalProperties > 1 && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                A mostrar a 1.ª de {totalProperties} casas
              </span>
            )}
          </div>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="flex">
      <Sidebar base="/inquilino" role="Inquilino" items={tenantNav("/inquilino")} alertCount={activeCount} account={account} />
      <div className="min-h-screen flex-1">{content}</div>
    </div>
  );
}

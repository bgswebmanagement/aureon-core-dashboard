import { TopBar } from "@/components/TopBar";
import { loadAccounts } from "@/lib/admin/accounts";
import { requireAdminPage } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/admin/service-client";
import { getAdminReader } from "@/lib/admin/reader";
import { InviteForm } from "./InviteForm";
import { UsersTable } from "./UsersTable";

export const dynamic = "force-dynamic";

export const metadata = { title: "Utilizadores — Aureon Core" };

export default async function AdminUsersPage() {
  // Verificação própria da página (não depende só do layout).
  const admin = await requireAdminPage();
  const reader = await getAdminReader();

  const alerts = await reader.getAlerts();
  const activeAlerts = alerts.filter((a) => a.active).length;
  const db = createAdminClient();
  const data = db ? await loadAccounts(db) : null;

  return (
    <>
      <TopBar title="Utilizadores" subtitle="Convidar, associar a casas e gerir acessos" role="Aureon Core" alertCount={activeAlerts} />
      <div className="space-y-6 p-6">
        {!data ? (
          <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
            A chave de administração (SUPABASE_SERVICE_ROLE_KEY) não está configurada neste ambiente, por isso não é possível
            gerir utilizadores aqui.
          </div>
        ) : (
          <>
            {data.error && <div className="rounded-xl border border-crit/30 bg-crit/10 p-4 text-sm text-crit">{data.error}</div>}
            <InviteForm properties={data.properties} />
            <UsersTable accounts={data.accounts} properties={data.properties} selfId={admin.id} />
          </>
        )}
      </div>
    </>
  );
}

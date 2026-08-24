import { Sidebar } from "@/components/Sidebar";
import { tenantNav } from "@/lib/nav";
import { getAlerts } from "@/lib/data";
import { DEMO_TENANT_PROPERTY_ID } from "@/lib/tenant";

// Render on every request instead of caching as static HTML at build time —
// once Supabase is live, hub/satellite data changes continuously.
export const dynamic = "force-dynamic";

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const alerts = await getAlerts(DEMO_TENANT_PROPERTY_ID);
  const activeCount = alerts.filter((a) => a.active).length;

  return (
    <div className="flex">
      <Sidebar base="/inquilino" role="Inquilino" items={tenantNav("/inquilino")} alertCount={activeCount} />
      <div className="min-h-screen flex-1">{children}</div>
    </div>
  );
}

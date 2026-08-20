import { Sidebar } from "@/components/Sidebar";
import { tenantNav } from "@/lib/nav";
import { getAlerts } from "@/lib/data";
import { DEMO_TENANT_PROPERTY_ID } from "@/lib/tenant";

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

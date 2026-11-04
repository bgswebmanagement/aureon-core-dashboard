import { DevicesView } from "@/components/DevicesView";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function AdminDevicesPage() {
  await requireAdminPage();
  return <DevicesView viewerRole="admin" role="Aureon Core" />;
}

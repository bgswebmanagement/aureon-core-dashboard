import { DevicesView } from "@/components/DevicesView";
import { requireAdminPage } from "@/lib/admin/guard";
import { getAdminReader } from "@/lib/admin/reader";

export default async function AdminDevicesPage() {
  await requireAdminPage();
  const data = await getAdminReader();
  return <DevicesView data={data} viewerRole="admin" role="Aureon Core" />;
}

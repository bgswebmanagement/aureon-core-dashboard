import { DevicesView } from "@/components/DevicesView";

export default async function AdminDevicesPage() {
  return <DevicesView viewerRole="admin" role="Aureon Core" />;
}

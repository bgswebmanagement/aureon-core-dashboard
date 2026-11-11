import { DevicesView } from "@/components/DevicesView";
import { requireOwnerScope } from "@/lib/owner/scope";

export default async function DevicesPage() {
  const { data } = await requireOwnerScope();
  return <DevicesView data={data} viewerRole="owner" role="Proprietário" />;
}

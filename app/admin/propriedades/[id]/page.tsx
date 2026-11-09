import { PropertyDetailView } from "@/components/PropertyDetailView";
import { requireAdminPage } from "@/lib/admin/guard";
import { getAdminReader } from "@/lib/admin/reader";

export default async function AdminPropertyDetail({ params }: { params: { id: string } }) {
  await requireAdminPage();
  const data = await getAdminReader();
  return <PropertyDetailView data={data} propertyId={params.id} viewerRole="admin" role="Aureon Core" />;
}

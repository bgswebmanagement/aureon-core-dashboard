import { PropertyDetailView } from "@/components/PropertyDetailView";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function AdminPropertyDetail({ params }: { params: { id: string } }) {
  await requireAdminPage();
  return <PropertyDetailView propertyId={params.id} viewerRole="admin" role="Aureon Core" />;
}

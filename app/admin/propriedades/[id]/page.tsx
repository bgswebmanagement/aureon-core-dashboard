import { PropertyDetailView } from "@/components/PropertyDetailView";

export default async function AdminPropertyDetail({ params }: { params: { id: string } }) {
  return <PropertyDetailView propertyId={params.id} viewerRole="admin" role="Aureon Core" />;
}

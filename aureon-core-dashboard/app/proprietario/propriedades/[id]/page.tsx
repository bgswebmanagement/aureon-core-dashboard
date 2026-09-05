import { PropertyDetailView } from "@/components/PropertyDetailView";

export default async function PropertyDetail({ params }: { params: { id: string } }) {
  return <PropertyDetailView propertyId={params.id} viewerRole="owner" role="Proprietário" />;
}

import { PropertyDetailView } from "@/components/PropertyDetailView";
import { requireOwnerScope } from "@/lib/owner/scope";

export default async function PropertyDetail({ params }: { params: { id: string } }) {
  const { data } = await requireOwnerScope();
  // Uma casa que não é deste dono não existe para ele: a base de dados não a
  // devolve, por isso dá a mesma página «não encontrado» que um id inventado.
  return <PropertyDetailView data={data} propertyId={params.id} viewerRole="owner" role="Proprietário" />;
}

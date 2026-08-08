import { ConsultantApplicationDetail } from "@/components/consultant-workflow/application-detail";

export default async function ConsultantApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConsultantApplicationDetail id={id} />;
}

import { ConsultantApplicationForm } from "@/components/consultant-workflow/application-form";

export default async function EditConsultantApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConsultantApplicationForm id={id} />;
}

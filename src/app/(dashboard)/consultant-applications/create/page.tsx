import { ConsultantApplicationForm } from "@/components/consultant-workflow/application-form";

export default async function CreateConsultantApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ source_field_task?: string }>;
}) {
  const params = await searchParams;
  return (
    <ConsultantApplicationForm
      sourceFieldTaskId={params.source_field_task ?? ""}
    />
  );
}

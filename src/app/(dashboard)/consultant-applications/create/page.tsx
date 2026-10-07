import { ConsultantApplicationForm } from "@/components/consultant-workflow/application-form";

export default async function CreateConsultantApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ source_field_task?: string; photos?: string }>;
}) {
  const params = await searchParams;
  return (
    <ConsultantApplicationForm
      sourceFieldTaskId={params.source_field_task ?? ""}
      // The photos ticked in 「待整理现场资料」 (2026-10 C1), comma-separated.
      sourcePhotoIds={(params.photos ?? "").split(",").filter(Boolean)}
    />
  );
}

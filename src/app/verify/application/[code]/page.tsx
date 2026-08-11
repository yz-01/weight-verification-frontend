import { ApplicationVerification } from "@/components/consultant-workflow/application-verification";

export default async function VerifyApplicationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ApplicationVerification code={code} />;
}

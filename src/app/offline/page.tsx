import { CloudOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function OfflinePage() {
  const t = await getTranslations("offline");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <CloudOff className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold">MSE Trace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("pageDescription")}
        </p>
      </div>
    </main>
  );
}

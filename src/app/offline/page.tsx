import { CloudOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function OfflinePage() {
  const t = await getTranslations("offline");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="surface-panel flex w-full max-w-md flex-col items-center gap-3 rounded-xl px-6 py-10 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <CloudOff className="size-6" />
        </span>
        <h1 className="text-lg font-semibold text-foreground">MSE Trace</h1>
        <p className="prose-measure text-sm text-muted-foreground">
          {t("pageDescription")}
        </p>
      </div>
    </main>
  );
}

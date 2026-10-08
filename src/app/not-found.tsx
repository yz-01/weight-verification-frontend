import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * An address that does not exist, in the app's own look (light and dark)
 * rather than Next's bare black-on-white page. The words are the ones the
 * forms already use for a record that cannot be found.
 */
export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="surface-panel flex w-full max-w-md flex-col items-center gap-3 rounded-xl px-6 py-10 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <FileQuestion className="size-6" />
        </span>
        <h1 className="text-lg font-semibold text-foreground">{t("notFound")}</h1>
        <p className="prose-measure text-sm text-muted-foreground">{t("notFoundBody")}</p>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-primary bg-(image:--primary-gradient) px-4 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 pointer-coarse:h-11"
        >
          {t("backToDashboard")}
        </Link>
      </div>
    </main>
  );
}

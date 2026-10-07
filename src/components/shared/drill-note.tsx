"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * 「只显示……」 above a list a dashboard card opened with a filter of its own
 * (B8, F8), and the button that drops that filter.
 *
 * A card's link narrows the list to exactly what the card counted, so its
 * number is the list's count. The narrowing has to be visible and undoable,
 * or the reader takes a filtered list for the whole module.
 */
export function DrillNote({
  label,
  clearLabel,
  params,
}: {
  label: string;
  clearLabel: string;
  /** The URL parameters the card added, removed together. */
  params: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const clear = () => {
    const next = new URLSearchParams(searchParams.toString());
    for (const param of params) next.delete(param);
    next.delete("page");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  return (
    <div
      data-drill-note
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
    >
      <span className="min-w-0 flex-1">{label}</span>
      <Button size="sm" variant="outline" onClick={clear}>
        {clearLabel}
      </Button>
    </div>
  );
}

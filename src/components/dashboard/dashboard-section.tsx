"use client";

import { ChevronRight } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  parseOpenSections,
  readOpenSectionsRaw,
  setSectionOpen,
  subscribeOpenSections,
} from "@/lib/dashboard-sections";
import { cn } from "@/lib/utils";

/**
 * One section of the 项目 Dashboard under the six cards (F7, Q21): a title
 * that opens and closes it, collapsed until this viewer opens it, and
 * remembered for them (`lib/dashboard-sections`). A closed section does not
 * render its body, so its queries do not run either.
 */
export function DashboardSection({
  id,
  title,
  subtitle,
  action,
  children,
}: {
  /** Stable key the viewer's choice is stored under. */
  id: string;
  title: string;
  subtitle?: string;
  /** A link beside the title (e.g. to the module); shown when open. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const viewer = user?.id ?? "";
  const raw = useSyncExternalStore(
    subscribeOpenSections,
    () => readOpenSectionsRaw(viewer),
    // The server cannot see this browser's choice: everything starts closed.
    () => "",
  );
  const open = parseOpenSections(raw).has(id);
  const body = `dashboard-section-${id}`;
  return (
    <section
      aria-label={title}
      data-dashboard-section={id}
      className="scroll-mt-4 rounded-lg border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => setSectionOpen(viewer, id, !open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{title}</span>
            {open && subtitle && (
              <span className="block text-xs text-muted-foreground">{subtitle}</span>
            )}
          </span>
        </button>
        {open && action}
      </div>
      {open && (
        <div id={body} className="border-t px-3 pb-3 pt-2">
          {children}
        </div>
      )}
    </section>
  );
}

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import {
  STATUS_DOT_CLASS,
  type StatusTone,
} from "@/components/shared/page-primitives";
import { toneOf } from "@/lib/tones";
import { cn } from "@/lib/utils";

/**
 * A vertical timeline (E2).
 *
 * The dashboard's old one was an `<ol>` with `border-l` for the line and each
 * dot absolutely placed at `-left-[1.4rem]`: two coordinate systems that only
 * met by luck, so the dots sat beside the line, and every dot was `bg-border`,
 * the same grey as the line and nearly the page - the client's screenshot
 * circled a column of scattered grey specks.
 *
 * Here the line and the dot are drawn in one rail per row: the dot is centred
 * on the rail and the two line segments meet at its centre, so it is on the
 * line by construction. The first row has no segment above its dot and the
 * last none below. The dot takes the same colour as the row's `StatusBadge`
 * (the badge's own `STATUS_DOT_CLASS`), with a ring in the page colour so it
 * stands off the line.
 *
 * Labels arrive already translated: the component knows nothing of a record's
 * kind, so the dashboard, head office and a record's own history can all use
 * it.
 */

export type TimelineTone = StatusTone;

export interface TimelineItem {
  key: string;
  /** The first line: what happened. */
  title: React.ReactNode;
  /** Under it, smaller: where, who. */
  meta?: React.ReactNode;
  /** A longer note, under the meta line. */
  note?: React.ReactNode;
  /** When, already formatted. */
  at?: React.ReactNode;
  /** Dot colour. Pass the tone the row's `StatusBadge` uses. */
  tone?: TimelineTone;
  /** Shown at the right end of the first line, typically a `StatusBadge`. */
  badge?: React.ReactNode;
  /** A small type icon before the title (hazard, geofence, delivery...). */
  icon?: LucideIcon;
  /**
   * A 40x40 photo at the right (E3's `cover_photo_url`). Nothing is drawn
   * without one - no placeholder box.
   */
  thumbnail?: string | null;
  /** The whole row is a link to here... */
  href?: string;
  /** ...or a button that runs this. `href` wins when both are given. */
  onOpen?: () => void;
}

/*
 * Rail geometry. `dot` is the dot's centre measured from the top of the row;
 * the content's first line is `line` tall inside `pad` of padding, so the dot
 * centre equals pad + line / 2 and the dot sits level with the title.
 */
const SIZES = {
  regular: {
    pad: "py-2",
    line: "min-h-6",
    text: "text-sm",
    dotTop: "top-5",
    above: "h-5",
    dot: "size-3",
    icon: "size-4",
  },
  compact: {
    pad: "py-1.5",
    line: "min-h-5",
    text: "text-xs",
    dotTop: "top-4",
    above: "h-4",
    dot: "size-2.5",
    icon: "size-3.5",
  },
} as const;

export function Timeline({
  items,
  size = "regular",
  label,
  className,
}: {
  items: TimelineItem[];
  size?: keyof typeof SIZES;
  /** Accessible name for the list. */
  label?: string;
  className?: string;
}) {
  const geometry = SIZES[size];
  return (
    <ol aria-label={label} className={cn("flex flex-col", className)} data-timeline>
      {items.map((item, index) => (
        <li key={item.key} data-timeline-row>
          <Row
            item={item}
            first={index === 0}
            last={index === items.length - 1}
            geometry={geometry}
          />
        </li>
      ))}
    </ol>
  );
}

function Row({
  item,
  first,
  last,
  geometry,
}: {
  item: TimelineItem;
  first: boolean;
  last: boolean;
  geometry: (typeof SIZES)[keyof typeof SIZES];
}) {
  const Icon = item.icon;
  const tone = item.tone ?? "neutral";
  const body = (
    <>
      <span aria-hidden className="relative w-5 shrink-0 self-stretch">
        {!first && (
          <span
            data-timeline-line="above"
            className={cn("absolute left-1/2 top-0 w-px -translate-x-1/2 bg-primary/30", geometry.above)}
          />
        )}
        {!last && (
          <span
            data-timeline-line="below"
            className={cn("absolute bottom-0 left-1/2 w-px -translate-x-1/2 bg-primary/30", geometry.dotTop)}
          />
        )}
        <span
          data-timeline-dot={tone}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background",
            geometry.dotTop,
            geometry.dot,
            STATUS_DOT_CLASS[tone],
            toneOf(tone).glow,
          )}
        />
      </span>
      <span className={cn("flex min-w-0 flex-1 items-start gap-3", geometry.pad)}>
        <span className="min-w-0 flex-1">
          <span className={cn("flex flex-wrap items-center justify-between gap-x-2 gap-y-1", geometry.line)}>
            <span className={cn("flex min-w-0 items-center gap-1.5", geometry.text)}>
              {Icon && (
                <Icon
                  aria-hidden
                  data-timeline-icon
                  className={cn("shrink-0 text-muted-foreground", geometry.icon)}
                />
              )}
              <span className="min-w-0 truncate font-medium">{item.title}</span>
            </span>
            {(item.badge || item.at) && (
              <span className="flex shrink-0 items-center gap-2">
                {item.badge}
                {item.at && (
                  <span className="text-xs text-muted-foreground tabular-nums">{item.at}</span>
                )}
              </span>
            )}
          </span>
          {item.meta && (
            <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>
          )}
          {item.note && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{item.note}</span>
          )}
        </span>
        {item.thumbnail && (
          // A user's photograph, served as-is: the same plain <img> the chat
          // thumbnails use.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail}
            alt=""
            loading="lazy"
            data-timeline-thumbnail
            className="size-10 shrink-0 rounded-lg border border-panel-border object-cover"
          />
        )}
      </span>
    </>
  );
  const rowClass = "flex w-full gap-2 text-left";
  const clickable =
    "rounded-lg transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (item.href) {
    return (
      <Link href={item.href} className={cn(rowClass, clickable)} data-timeline-open="link">
        {body}
      </Link>
    );
  }
  if (item.onOpen) {
    return (
      <button
        type="button"
        onClick={item.onOpen}
        className={cn(rowClass, clickable)}
        data-timeline-open="button"
      >
        {body}
      </button>
    );
  }
  return <div className={rowClass}>{body}</div>;
}

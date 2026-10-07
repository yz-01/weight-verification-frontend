"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { PhotoThumb, recordKindIcon } from "@/components/shared/photo-thumb";
import { useApprovalOpener } from "@/components/dashboard/approval-opener";
import {
  type OpenedRecordHeading,
  useRecordOpener,
} from "@/components/shared/record-opener";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { ContractorDashboard } from "@/interfaces/contractor-dashboard";
import {
  attendanceRecordHref,
  cardListHref,
  type DashboardCard,
} from "@/lib/dashboard-cards";
import { useDateFormat } from "@/lib/dates";
import { recordTarget } from "@/lib/record-routes";
import { TONES, type Tone as DataTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { getReceipts } from "@/services/contractor.service";
import {
  getAttendance,
  getSafetyIncidents,
} from "@/services/site-operations.service";

/** How many items a card's pop-up lists (Q20). */
const PREVIEW = 5;

const CARD_TONE: Record<DashboardCard, DataTone> = {
  waiting: "cyan",
  approvals: "amber",
  rectifications: "rose",
  receipts: "green",
  attendance: "blue",
  safety: "purple",
};

type Tone = "primary" | "info" | "danger" | "warning";

/** One line in a card's pop-up: the record, and where it opens. */
interface PreviewItem {
  key: string;
  label: string;
  meta?: string;
  href?: string;
  onOpen?: () => void;
  /** The record's photograph (E3): its thumbnail, count and kind for the icon. */
  photo?: { url?: string | null; count?: number; kind: string };
}

/**
 * The 项目 Dashboard's first screen (B8, F6; Q6, Q20): six small cards, name
 * and number on one line. Pointing at one shows its first five items, each
 * opening its record; clicking the card opens the full list, counted the way
 * the number was. On a phone a tap opens the five, with 「查看全部」 under them.
 *
 * This replaces the three big lists (等你处理 / 待审批事项 / 待处理整改) that
 * used to fill the first screen: 「鼠标指着小卡时才跑出来，整个页面空间就多了」.
 */
export function DashboardCards({
  data,
  unread,
  rectifications,
  project,
}: {
  data: ContractorDashboard;
  unread: ContractorDashboard["unread"];
  rectifications: ContractorDashboard["rectifications"];
  project: string;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  // 「等你处理」 rows say the record waits for the reader's 【确认】, so a row
  // whose module has no detail page yet opens a sheet that offers it (C4).
  const waitingOpener = useRecordOpener({ confirm: true });
  const approvalOpener = useApprovalOpener();
  const scope = { project: project || undefined, date: data.date };
  const today = data.overview?.today;
  const kind = (value: string) =>
    t.has(`archiveQueue.kind.${value}`) ? t(`archiveQueue.kind.${value}`) : value;

  const cards: Array<{
    card: DashboardCard;
    label: string;
    value: number | undefined;
    tone?: Tone;
    items?: PreviewItem[];
  }> = [
    {
      card: "waiting",
      label: t("contractorDashboard.unread.title"),
      value: unread?.total,
      tone: "primary",
      items: unread?.rows.slice(0, PREVIEW).map((row) => {
        const heading: OpenedRecordHeading = {
          reference: row.reference || row.title,
          project_id: row.project_id || null,
          project_name: row.project,
          submitted_at: row.waiting_since,
        };
        return {
          key: `${row.kind}:${row.id}`,
          label: [row.reference, row.title].filter(Boolean).join(" · "),
          meta: [kind(row.kind), row.project].filter(Boolean).join(" · "),
          photo: { url: row.cover_photo_url, count: row.photo_count, kind: row.kind },
          onOpen: recordTarget(row.kind, row.id)
            ? () => waitingOpener.open(row.kind, row.id, heading)
            : undefined,
        };
      }),
    },
    {
      card: "approvals",
      label: t("contractorDashboard.approvals.title"),
      value: data.approvals?.total,
      tone: "info",
      items: data.approvals?.rows.slice(0, PREVIEW).map((row) => ({
        key: `${row.source}:${row.id}`,
        label: row.approval_no ? `${row.approval_no} · ${row.title}` : row.title,
        meta: [
          t.has(`contractorDashboard.approvals.source.${row.source}`)
            ? t(`contractorDashboard.approvals.source.${row.source}`)
            : row.resource_type,
          row.project || t("contractorDashboard.approvals.companyWide"),
        ].join(" · "),
        photo: { url: row.cover_photo_url, count: row.photo_count, kind: row.source },
        onOpen: () => approvalOpener.open(row),
      })),
    },
    {
      card: "rectifications",
      label: t("contractorDashboard.rectifications.title"),
      value: rectifications?.total,
      tone: "danger",
      items: rectifications?.rows.slice(0, PREVIEW).map((row) => {
        const target = recordTarget(row.kind, row.id);
        return {
          key: row.id,
          label: `${row.incident_no} · ${row.title}`,
          meta: [
            t(`contractorDashboard.rectifications.step.${row.next_step}`),
            row.days_overdue !== null
              ? t("contractorDashboard.rectifications.daysOverdue", { days: row.days_overdue })
              : "",
            row.project,
          ]
            .filter(Boolean)
            .join(" · "),
          photo: { url: row.cover_photo_url, count: row.photo_count, kind: row.kind },
          href: target && "href" in target ? target.href : undefined,
        };
      }),
    },
    {
      card: "receipts",
      label: t("contractorDashboard.overview.materialReceipts"),
      value: today?.material_receipts,
    },
    {
      card: "attendance",
      label: t("contractorDashboard.overview.attendance"),
      value: today?.attendance_events,
    },
    {
      card: "safety",
      label: t("contractorDashboard.overview.safety"),
      value: today?.safety_incidents,
      tone: "warning",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-dashboard-cards>
        {cards
          .filter((row) => row.value !== undefined)
          .map((row) => (
            <SmallCard
              key={row.card}
              card={row.card}
              label={row.label}
              value={row.value ?? 0}
              tone={(row.value ?? 0) > 0 ? row.tone : undefined}
              href={cardListHref(row.card, scope)}
              items={row.items}
              fetchItems={
                row.items ? undefined : (
                  <FetchedPreview card={row.card} scope={scope} dateTime={df.dateTime} />
                )
              }
            />
          ))}
      </div>
      {waitingOpener.sheet}
      {approvalOpener.element}
    </>
  );
}

function SmallCard({
  card,
  label,
  value,
  tone,
  href,
  items,
  fetchItems,
}: {
  card: DashboardCard;
  label: string;
  value: number;
  tone?: Tone;
  href: string;
  items?: PreviewItem[];
  /** For a card whose items are not in the dashboard payload: fetched on open. */
  fetchItems?: React.ReactNode;
}) {
  const t = useTranslations("contractorDashboard.cards");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // How the last press began: a mouse click opens the list, a tap opens the
  // pop-up (a phone has no pointing-at).
  const pointer = useRef("");
  // Whether the pop-up was open when the press began: tapping the card again
  // closes it, though the press itself already counts as "outside" for it.
  const openAtPress = useRef(false);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keep = () => {
    if (closing.current) clearTimeout(closing.current);
    closing.current = null;
  };
  const show = () => {
    keep();
    setOpen(true);
  };
  const hideSoon = () => {
    keep();
    closing.current = setTimeout(() => setOpen(false), 150);
  };
  // The canvas's six data colours, one per card (design 「项目仪表板」).
  // `tone` still says what the figure means; the card's colour is its own.
  void tone;
  const colours = TONES[CARD_TONE[card]];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          data-dashboard-card={card}
          aria-haspopup="dialog"
          aria-expanded={open}
          onPointerDown={(event) => {
            pointer.current = event.pointerType;
            openAtPress.current = open;
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") show();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") hideSoon();
          }}
          onClick={() => {
            const touch = pointer.current === "touch" || pointer.current === "pen";
            // A keyboard press has no pointer: it opens the list.
            pointer.current = "";
            if (touch) {
              if (openAtPress.current) setOpen(false);
              else show();
              return;
            }
            router.push(href);
          }}
          className={cn(
            "flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition hover:-translate-y-px hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            colours.surface,
          )}
        >
          {/* Never cut: the name is the whole point of a card this small. */}
          <span className="min-w-0 text-xs font-medium leading-tight text-muted-foreground">
            {label}
          </span>
          <span className={cn("kpi-figure shrink-0 text-xl", colours.text)}>
            {format.number(value)}
          </span>
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] gap-1.5"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") keep();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") hideSoon();
        }}
      >
        <p className="flex items-baseline justify-between gap-2 border-b border-panel-border pb-2 text-sm font-semibold">
          <span>{label}</span>
          <span className="tabular-nums">{format.number(value)}</span>
        </p>
        <div onClick={() => setOpen(false)}>
          {items ? <PreviewList items={items} /> : fetchItems}
        </div>
        <Link
          href={href}
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-1 self-end text-xs font-semibold text-primary hover:underline"
        >
          {t("viewAll")}
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function PreviewList({ items }: { items: PreviewItem[] }) {
  const t = useTranslations("contractorDashboard.cards");
  if (items.length === 0) {
    return <p className="py-2 text-center text-xs text-muted-foreground">{t("empty")}</p>;
  }
  const row = "block w-full rounded px-1.5 py-1 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <ul className="divide-y">
      {items.map((item) => {
        const text = (
          <>
            <span className="block text-sm font-medium leading-snug">{item.label}</span>
            {item.meta && (
              <span className="block text-xs text-muted-foreground">{item.meta}</span>
            )}
          </>
        );
        // The record's photograph on the left (E3). Not a button of its own:
        // the line already opens the record, where every photo is.
        const body = item.photo ? (
          <span className="flex items-center gap-2">
            <PhotoThumb
              coverUrl={item.photo.url}
              count={item.photo.count}
              icon={recordKindIcon(item.photo.kind)}
              reference={item.label}
              size="sm"
              openable={false}
            />
            <span className="min-w-0 flex-1">{text}</span>
          </span>
        ) : (
          text
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className={row}>
                {body}
              </Link>
            ) : item.onOpen ? (
              <button type="button" className={row} onClick={item.onOpen}>
                {body}
              </button>
            ) : (
              <span className="block px-1.5 py-1">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The first five of a card whose rows are not in the dashboard's payload -
 * today's deliveries, clock events and safety incidents - read from the very
 * list the card opens, with the same filter, when the pop-up opens.
 */
function FetchedPreview({
  card,
  scope,
  dateTime,
}: {
  card: DashboardCard;
  scope: { project?: string; date: string };
  dateTime: (value: string) => string;
}) {
  const t = useTranslations();
  const day = { date_from: scope.date, date_to: scope.date, project: scope.project };
  const preview = useQuery({
    queryKey: ["contractor-dashboard", "card-preview", card, scope.project ?? "", scope.date],
    queryFn: async (): Promise<PreviewItem[]> => {
      if (card === "receipts") {
        const page = await getReceipts({ ...day, direction: "IN", page_size: PREVIEW });
        return page.results.map((row) => {
          const target = recordTarget("MATERIAL_RECEIPT", row.id);
          return {
            key: row.id,
            label: `${row.receipt_no} · ${row.material_name}`,
            meta: row.project_name,
            href: target && "href" in target ? target.href : undefined,
          };
        });
      }
      if (card === "attendance") {
        const page = await getAttendance({ ...day, page_size: PREVIEW });
        return page.results.map((row) => ({
          key: row.id,
          label: `${row.user_name} · ${t(`attendance.event.${row.event}`)}`,
          meta: [dateTime(row.occurred_at), row.project_name].join(" · "),
          href: attendanceRecordHref({ user: row.user, date: scope.date, project: scope.project }),
        }));
      }
      const page = await getSafetyIncidents({
        ...day,
        workflow: "rectification",
        page_size: PREVIEW,
      });
      return page.results.map((row) => {
        const target = recordTarget("SAFETY_INCIDENT", row.id);
        return {
          key: row.id,
          label: `${row.incident_no} · ${row.title}`,
          meta: row.project_name,
          href: target && "href" in target ? target.href : undefined,
        };
      });
    },
    staleTime: 30_000,
  });
  if (preview.isError) {
    return <QueryFailedNote query={preview} what={t("contractorDashboard.cards.what")} />;
  }
  if (!preview.data) {
    return (
      <p className="flex justify-center py-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-label={t("contractorDashboard.cards.loading")} />
      </p>
    );
  }
  return <PreviewList items={preview.data} />;
}

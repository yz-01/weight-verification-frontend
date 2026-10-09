"use client";

/**
 * What one 累计净数量 line is made of (client request 2026-10-09).
 *
 * 「有数量统计，却不能点击查看数量来源和退场记录」: 「累计进场」, 「已退场」 and
 * 「累计净数量」 open here, each on its own tab - every delivery behind the
 * gross, every completed return behind 已退场 (why, who approved it and
 * when, the photographs and signatures), and the sum that makes the net.
 * 「这里必须要点进去可以操作的」: each row opens the record's own popup - the
 * delivery's `ViewReceipt`, the return's 材料出场 detail with the buttons it
 * always had - over this list, which stays open behind it.
 *
 * The server finds the line among the totals' own lines with the page's
 * filters (`get_net_breakdown`), so the rows add up to the number pressed.
 * On a phone the dialog is the bottom sheet every dialog is there.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2, PackageMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { OutgoingDecision } from "@/components/dashboard/approval-opener";
import { ViewReceipt } from "@/components/receipts/view-receipt";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { PhotoThumb, recordPhotos, rowPhotos } from "@/components/shared/photo-thumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUnitName } from "@/hooks/use-material-units";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  getReceiptNetBreakdown,
  netLineKey,
  type MaterialNetBreakdownItem,
  type MaterialNetTotalRow,
} from "@/services/contractor.service";

/** Which number was pressed: the tab the dialog opens on. */
export type NetFocus = "received" | "returned" | "net";

type Opened = { kind: "receipt" | "outgoing"; id: string } | null;

export function NetBreakdownDialog({
  row,
  query,
  focus,
  onClose,
}: {
  row: MaterialNetTotalRow;
  /** The totals' own query: project, supplier, dates, material search. */
  query: Record<string, string>;
  focus: NetFocus;
  onClose: () => void;
}) {
  const t = useTranslations("receipts.net");
  const unitName = useUnitName();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<NetFocus>(focus);
  const [opened, setOpened] = useState<Opened>(null);
  const breakdown = useQuery({
    queryKey: ["receipts", "net-breakdown", query, netLineKey(row)],
    queryFn: () => getReceiptNetBreakdown(query, row),
  });
  const data = breakdown.data;
  const line = data?.line ?? null;
  const unit = unitName(row.unit);
  const closeRecord = () => {
    setOpened(null);
    // A step taken inside (a correction, a confirmation) can move the numbers.
    void queryClient.invalidateQueries({ queryKey: ["receipts", "net-totals"] });
    void queryClient.invalidateQueries({ queryKey: ["receipts", "net-breakdown"] });
  };
  const numbers: Array<[NetFocus, string]> = [
    ["received", line?.received ?? row.received],
    ["returned", line?.returned ?? row.returned],
    ["net", line?.net ?? row.net],
  ];

  return (
    <>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl" data-slot="net-breakdown">
          <DialogHeader>
            <DialogTitle>
              {[row.material_name, row.material_specification].filter(Boolean).join(" · ")} · {unit}
            </DialogTitle>
            <DialogDescription>
              {row.supplier_name || t("noSupplier")}
              {row.project_name ? ` · ${row.project_name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(next) => setTab(next as NetFocus)}>
            <TabsList className="w-full sm:w-fit">
              {numbers.map(([key, value]) => (
                <TabsTrigger key={key} value={key} className="flex-1 gap-1.5 sm:flex-none">
                  {t(key)}
                  <span className="tabular font-semibold">{value}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <QueryFailedNote query={breakdown} what={t("breakdown.what")} />
          {breakdown.isLoading ? (
            <div className="grid min-h-24 place-items-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : data && !line ? (
            <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
              {t("breakdown.gone")}
            </p>
          ) : data && line ? (
            <div className="space-y-4">
              {tab === "net" ? (
                <BreakdownSum
                  received={line.received}
                  returned={line.returned}
                  net={line.net}
                  deliveries={data.deliveries.length}
                  returns={data.returns.length}
                  unit={unit}
                />
              ) : null}
              {tab !== "returned" ? (
                <BreakdownSection
                  title={t("breakdown.deliveries", { count: data.deliveries.length })}
                  subtotal={`${line.received} ${unit}`}
                  empty={t("breakdown.emptyDeliveries")}
                  rows={data.deliveries}
                  render={(item) => (
                    <BreakdownDeliveryRow
                      key={item.id}
                      item={item}
                      unit={unit}
                      onOpen={() => setOpened({ kind: "receipt", id: item.id })}
                    />
                  )}
                />
              ) : null}
              {tab !== "received" ? (
                <BreakdownSection
                  title={t("breakdown.returns", { count: data.returns.length })}
                  subtotal={`${line.returned} ${unit}`}
                  empty={t("breakdown.emptyReturns")}
                  rows={data.returns}
                  render={(item) => (
                    <BreakdownReturnRow
                      key={`${item.kind}:${item.id}`}
                      item={item}
                      unit={unit}
                      onOpen={() =>
                        setOpened({ kind: item.kind === "RETURN" ? "outgoing" : "receipt", id: item.id })
                      }
                    />
                  )}
                />
              ) : null}
              {tab === "received" && data.rejected.length ? (
                <BreakdownSection
                  title={t("breakdown.rejected", { count: data.rejected.length })}
                  subtotal={`${line.rejected} ${unit}`}
                  muted
                  empty=""
                  rows={data.rejected}
                  render={(item) => (
                    <BreakdownDeliveryRow
                      key={item.id}
                      item={item}
                      unit={unit}
                      onOpen={() => setOpened({ kind: "receipt", id: item.id })}
                    />
                  )}
                />
              ) : null}
              <p className="text-xs text-muted-foreground">{t("note")}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {opened?.kind === "receipt" ? (
        <ViewReceipt id={opened.id} presentation="dialog" onClose={closeRecord} />
      ) : null}
      {opened?.kind === "outgoing" ? <OutgoingDecision id={opened.id} onClose={closeRecord} /> : null}
    </>
  );
}

/** 进场合计 − 已完成退场合计 = 累计净数量, with the line's own numbers. */
function BreakdownSum({
  received,
  returned,
  net,
  deliveries,
  returns,
  unit,
}: {
  received: string;
  returned: string;
  net: string;
  deliveries: number;
  returns: number;
  unit: string;
}) {
  const t = useTranslations("receipts.net");
  const lines: Array<[string, string, string, string]> = [
    ["", t("breakdown.receivedTotal"), received, t("breakdown.deliveries", { count: deliveries })],
    ["−", t("breakdown.returnedTotal"), returned, t("breakdown.returns", { count: returns })],
    ["=", t("net"), net, ""],
  ];
  return (
    <dl className="surface-panel rounded-xl p-3 text-sm" data-slot="net-sum">
      {lines.map(([sign, label, value, hint], index) => (
        <div
          key={label}
          className={cn(
            "flex items-baseline gap-2 py-1",
            index === lines.length - 1 && "mt-1 border-t border-panel-border pt-2 font-semibold",
          )}
        >
          <span className="w-4 shrink-0 text-center text-muted-foreground" aria-hidden>
            {sign}
          </span>
          <dt className="min-w-0 flex-1">
            {label}
            {hint ? <span className="block text-xs font-normal text-muted-foreground">{hint}</span> : null}
          </dt>
          <dd className="tabular whitespace-nowrap text-right">
            {value} {unit}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BreakdownSection({
  title,
  subtotal,
  empty,
  rows,
  render,
  muted = false,
}: {
  title: string;
  subtotal: string;
  empty: string;
  rows: MaterialNetBreakdownItem[];
  render: (item: MaterialNetBreakdownItem) => React.ReactNode;
  muted?: boolean;
}) {
  const t = useTranslations("receipts.net");
  return (
    <section className={cn("space-y-2", muted && "opacity-80")}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="tabular text-xs text-muted-foreground">
          {t("breakdown.subtotal")} <span className="font-semibold text-foreground">{subtotal}</span>
        </span>
      </div>
      {rows.length ? (
        <ul className="space-y-2">{rows.map(render)}</ul>
      ) : (
        <p className="rounded-lg border border-dashed border-panel-border p-4 text-center text-xs text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

/** The part of a row that opens its record, or plain text for a reader who may not open it. */
function RowOpener({
  allowed,
  label,
  onOpen,
  children,
}: {
  allowed: boolean;
  label: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  if (!allowed) return <div className="min-w-0 flex-1">{children}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      className="min-w-0 flex-1 rounded-md text-left transition hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

/** One delivery: when, how much, its DO, its photograph, the supplier and the project. */
function BreakdownDeliveryRow({
  item,
  unit,
  onOpen,
}: {
  item: MaterialNetBreakdownItem;
  unit: string;
  onOpen: () => void;
}) {
  const t = useTranslations("receipts.net");
  const df = useDateFormat();
  const { can } = useAuth();
  return (
    <li
      className="flex items-start gap-3 rounded-lg border border-panel-border p-2"
      data-slot="net-breakdown-row"
      data-kind={item.kind}
    >
      <PhotoThumb
        coverUrl={item.cover_photo_url}
        count={item.photo_count}
        icon={ClipboardList}
        reference={item.reference}
        photos={recordPhotos("MATERIAL_RECEIPT", item.id, item.reference)}
      />
      <RowOpener allowed={can("receipt.view")} label={t("breakdown.open", { reference: item.reference })} onOpen={onOpen}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-primary">{item.reference}</span>
          <span className="tabular whitespace-nowrap font-semibold">
            {item.quantity} {unit}
          </span>
        </span>
        <span className="block text-xs text-muted-foreground">
          {item.date ? df.dateTime(item.date) : "—"} · {t("item.doNo")} {item.delivery_note_no || "—"}
          {item.vehicle_plate ? ` · ${item.vehicle_plate}` : ""}
        </span>
        <span className="block text-xs text-muted-foreground">
          {item.supplier_name || t("noSupplier")}
          {item.manufacturer_name ? ` · ${item.manufacturer_name}` : ""}
          {item.project_name ? ` · ${item.project_name}` : ""}
        </span>
      </RowOpener>
    </li>
  );
}

/**
 * One completed return: its Return Note, why it went back, who approved it
 * and when, how much, its photographs and the signatures.
 */
function BreakdownReturnRow({
  item,
  unit,
  onOpen,
}: {
  item: MaterialNetBreakdownItem;
  unit: string;
  onOpen: () => void;
}) {
  const t = useTranslations("receipts.net");
  const df = useDateFormat();
  const { can } = useAuth();
  const record = item.outgoing ?? null;
  const allowed = item.kind === "RETURN" ? can("material_outgoing.view") : can("receipt.view");
  const signatures: Array<{ key: string; url: string; label: string }> = [];
  if (record) {
    for (const [key, url, label] of [
      ["site", record.site_signature, t("breakdown.siteSignature")],
      ["supplier", record.supplier_signature, t("breakdown.supplierSignature")],
      ["approver", record.approver_signature, t("breakdown.approverSignature")],
    ] as const) {
      if (url) signatures.push({ key, url, label });
    }
  }
  return (
    <li
      className="flex flex-wrap items-start gap-3 rounded-lg border border-panel-border p-2"
      data-slot="net-breakdown-row"
      data-kind={item.kind}
    >
      <PhotoThumb
        coverUrl={item.cover_photo_url}
        count={item.photo_count}
        icon={PackageMinus}
        reference={item.reference}
        photos={
          record
            ? rowPhotos(record.photos, item.reference)
            : recordPhotos("MATERIAL_RECEIPT", item.id, item.reference)
        }
      />
      <RowOpener allowed={allowed} label={t("breakdown.open", { reference: item.reference })} onOpen={onOpen}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-primary">
            {item.return_note_no ? `${t("item.returnNote")} ${item.return_note_no}` : item.reference}
          </span>
          <span className="tabular whitespace-nowrap font-semibold">
            −{item.quantity} {unit}
          </span>
        </span>
        <span className="block text-xs text-muted-foreground">
          {item.date ? df.dateTime(item.date) : "—"}
          {item.return_note_no ? ` · ${item.reference}` : ""}
          {item.supplier_name ? ` · ${item.supplier_name}` : ""}
          {item.project_name ? ` · ${item.project_name}` : ""}
        </span>
        {record ? (
          <>
            <span className="block text-xs">
              <span className="text-muted-foreground">{t("breakdown.reason")}</span>{" "}
              {record.reason || "—"}
            </span>
            <span className="block text-xs">
              <span className="text-muted-foreground">{t("breakdown.approvedBy")}</span>{" "}
              {record.approved_by_name || record.approver_name || "—"}
              {record.approved_at ? ` · ${df.dateTime(record.approved_at)}` : ""}
            </span>
            {record.completed_by_name ? (
              <span className="block text-xs">
                <span className="text-muted-foreground">{t("breakdown.completedBy")}</span>{" "}
                {record.completed_by_name}
                {record.completed_at ? ` · ${df.dateTime(record.completed_at)}` : ""}
              </span>
            ) : null}
          </>
        ) : (
          <span className="block text-xs text-muted-foreground">{t("breakdown.legacyReturn")}</span>
        )}
      </RowOpener>
      {signatures.length ? (
        <div className="flex gap-1.5 max-sm:w-full max-sm:pl-15">
          {signatures.map(({ key, url, label }) => (
            <PhotoThumb
              key={key}
              size="sm"
              coverUrl={url}
              count={1}
              icon={PackageMinus}
              reference={`${item.reference} · ${label}`}
              photos={[{ id: `${item.id}-${key}`, url, label }]}
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

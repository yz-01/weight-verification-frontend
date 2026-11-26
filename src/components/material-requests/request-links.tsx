"use client";

/**
 * 材料进场 / 材料退场 / 材料领用 linked to their MR / 其他申请 (JB279, 客户 11-26 事项 20).
 *
 * 「材料进场、材料退场及材料领用，必须能够选择并关联本项目对应的 MR／其他申请记录。」
 * 「同一申请允许关联多笔材料记录。」
 * 「在 MR／其他申请页面，可以查看所有已关联的材料进场、退场及领用记录，并点击查看原始资料。」
 * 「未完成关联，不允许确认归档。」
 * 「数量统计方面，材料进场数量与 MR 申请数量进行对比，材料退场及材料领用数量保持独立统计，
 * 不互相扣减。」
 *
 * Three pieces, one per place the client named:
 *
 * * `RequestLinkPicker` - the project's requests to tick, on the phone forms
 *   that file a record and in the office's 「关联申请」 window;
 * * `RecordRequestLinksPanel` - a record's linked requests on its office
 *   page, with the window that changes them before it is archived;
 * * `RequestLinkedRecordsPanel` - on the request's page, every linked record
 *   (click one to open it) and the quantities, each kind apart.
 *
 * The server holds every rule (same project only, archived records keep
 * their links, archive refused while none); these only show it.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useUnitLabel } from "@/components/material-requests/request-form";
import { LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { recordClosureKey } from "@/components/shared/record-closure";
import { ShellPanel } from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import type {
  LinkableRequest,
  LinkedRecord,
  RequestLinkRecordKind,
} from "@/interfaces/material-request-link";
import { useDateFormat } from "@/lib/dates";
import {
  getLinkableRequests,
  getRecordRequestLinks,
  getRequestLinkedRecords,
  recordRequestLinksKey,
  requestLinkedRecordsKey,
  setRecordRequestLinks,
} from "@/services/material-request-link.service";

const STATUS_TONE = { SUBMITTED: "warning", APPROVED: "positive", RETURNED: "neutral" } as const;

/** Where one linked record opens: its own module's page. */
export function linkedRecordHref(row: Pick<LinkedRecord, "kind" | "id">): string {
  const id = encodeURIComponent(row.id);
  if (row.kind === "RECEIPT") return `/receipts/${id}`;
  if (row.kind === "ISSUE") return `/material-outgoing?record=${id}&kind=ISSUE`;
  return `/material-outgoing?record=${id}`;
}

/** 「钢筋 Y12 10 吨、水泥 20 包」 for a material request, the subject for an other one. */
export function requestSummary(
  row: Pick<LinkableRequest, "request_type" | "subject" | "lines" | "material_name" | "specification" | "quantity" | "unit">,
  unitLabel: (unit: string) => string,
): string {
  if (row.request_type !== "MATERIAL") return row.subject || "—";
  const lines = row.lines.length
    ? row.lines
    : [{ material_name: row.material_name, specification: row.specification, quantity: row.quantity, unit: row.unit }];
  return lines
    .map((line) =>
      [line.material_name, line.specification, line.quantity ? `${line.quantity} ${unitLabel(line.unit)}` : ""]
        .filter(Boolean)
        .join(" "),
    )
    .join("、");
}

function RequestLine({ row }: { row: LinkableRequest }) {
  const t = useTranslations("materialRequest");
  const unitLabel = useUnitLabel();
  return (
    <span className="min-w-0 flex-1 space-y-0.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{row.request_no}</span>
        <span className="text-xs text-muted-foreground">{row.request_kind_name || t(`type.${row.request_type}`)}</span>
        <StatusBadge label={t(`status.${row.status}`)} tone={STATUS_TONE[row.status]} />
      </span>
      <span className="block text-sm text-muted-foreground">{requestSummary(row, unitLabel)}</span>
    </span>
  );
}

/**
 * The project's MR / 其他申请 to tick (any number). `value` is the chosen ids.
 * Nothing is chosen for the worker: the record files without one and the
 * office links it before 确认归档.
 */
export function RequestLinkPicker({
  project,
  value,
  onChange,
  disabled = false,
}: {
  project: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("jb279.link");
  const unitLabel = useUnitLabel();
  const [search, setSearch] = useState("");
  const options = useQuery({
    queryKey: ["material-request-links", "options", project],
    queryFn: () => getLinkableRequests(project),
    enabled: Boolean(project),
    staleTime: 30_000,
  });
  const rows = useMemo(() => options.data?.results ?? [], [options.data]);
  const term = search.trim().toLowerCase();
  const shown = term
    ? rows.filter((row) =>
        `${row.request_no} ${row.request_kind_name} ${requestSummary(row, unitLabel)}`.toLowerCase().includes(term),
      )
    : rows;
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value.filter((item) => item !== id), id] : value.filter((item) => item !== id));

  if (!project) return <p className="text-sm text-muted-foreground">{t("chooseProjectFirst")}</p>;
  if (options.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("loading")}
      </p>
    );
  }
  if (options.isError) return <LoadFailed what={t("what")} onRetry={() => void options.refetch()} className="p-3" />;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <div className="space-y-2" data-slot="request-link-picker">
      {rows.length > 6 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("search")}
          />
        </div>
      ) : null}
      <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
        {shown.map((row) => {
          const checked = value.includes(row.id);
          return (
            <li key={row.id}>
              <label className="flex min-h-12 cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40">
                <Checkbox
                  className="mt-1"
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(next) => toggle(row.id, next === true)}
                  aria-label={row.request_no}
                />
                <RequestLine row={row} />
              </label>
            </li>
          );
        })}
      </ul>
      {value.length > 0 ? <p className="text-xs text-muted-foreground">{t("chosen", { count: value.length })}</p> : null}
    </div>
  );
}

/**
 * A 进场 / 退场 / 领用 record's linked requests on its office page, and the
 * 「关联申请」 window. Says plainly when none is linked: it cannot be archived.
 */
export function RecordRequestLinksPanel({ kind, recordId }: { kind: RequestLinkRecordKind; recordId: string }) {
  const t = useTranslations("jb279.link");
  const df = useDateFormat();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState("");
  const state = useQuery({
    queryKey: recordRequestLinksKey(kind, recordId),
    queryFn: () => getRecordRequestLinks(kind, recordId),
  });
  const save = useMutation({
    mutationFn: () => setRecordRequestLinks(kind, recordId, chosen),
    onSuccess: (data) => {
      qc.setQueryData(recordRequestLinksKey(kind, recordId), data);
      // The 确认归档 button reads whether a link is missing.
      void qc.invalidateQueries({ queryKey: recordClosureKey(kind, recordId) });
      void qc.invalidateQueries({ queryKey: ["material-request-links", "request"] });
      setEditing(false);
      setError("");
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("failed")),
  });
  const data = state.data;
  return (
    <ShellPanel
      title={t("title")}
      data-record-request-links={kind}
      aside={
        data?.may_change ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setChosen(data.links.map((link) => link.id));
              setError("");
              setEditing(true);
            }}
          >
            <Link2 />
            {data.links.length ? t("change") : t("edit")}
          </Button>
        ) : null
      }
    >
      {state.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : state.isError || !data ? (
        <LoadFailed what={t("what")} onRetry={() => void state.refetch()} className="p-3" />
      ) : (
        <div className="space-y-2">
          {data.missing && !data.archived ? (
            <p role="status" className="rounded-md bg-warning/10 px-2 py-1.5 text-sm font-medium text-warning">
              {t("missing")}
            </p>
          ) : null}
          {data.links.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {data.links.map((link) => (
                <li key={link.id}>
                  <Link
                    href={`/material-requests?record=${encodeURIComponent(link.id)}`}
                    className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/40"
                  >
                    <RequestLine row={link} />
                    {link.linked_by_name ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t("linkedBy", { name: link.linked_by_name, when: df.dateTime(link.linked_at) })}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.archived && data.links.length > 0 ? (
            <p className="text-xs text-muted-foreground">{t("lockedArchived")}</p>
          ) : null}
        </div>
      )}
      {editing && data ? (
        <Dialog open onOpenChange={(open) => !open && setEditing(false)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("dialogTitle", { reference: data.reference })}</DialogTitle>
              <DialogDescription>{t("help")}</DialogDescription>
            </DialogHeader>
            <RequestLinkPicker project={data.project} value={chosen} onChange={setChosen} disabled={save.isPending} />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={save.isPending}>
                {t("cancel")}
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
                {t("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </ShellPanel>
  );
}

function recordStatusKey(row: LinkedRecord): string {
  if (row.kind === "RECEIPT") return `receipts.acceptance.status.${row.status}`;
  if (row.kind === "ISSUE") return `contractorOps.issue.status.${row.status}`;
  return `contractorOps.outgoingStatus.${row.status}`;
}

/**
 * On an MR / 其他申请's page: every linked 进场 / 退场 / 领用 (newest first, a
 * click opens the original) and, for a material request, each material's
 * 申请 against what its linked records add up to - 进场 compared with 申请,
 * 退场 and 领用 each on their own, nothing taken off anything.
 */
export function RequestLinkedRecordsPanel({ requestId }: { requestId: string }) {
  const t = useTranslations("jb279.records");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const unitLabel = useUnitLabel();
  const router = useRouter();
  const state = useQuery({
    queryKey: requestLinkedRecordsKey(requestId),
    queryFn: () => getRequestLinkedRecords(requestId),
  });
  if (state.isLoading) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (state.isError || !state.data) {
    return <LoadFailed what={t("what")} onRetry={() => void state.refetch()} className="p-3" />;
  }
  const { records, totals } = state.data;
  const quantity = (value: string | null, unit: string) => (value === null ? "—" : `${value} ${unitLabel(unit)}`);
  const status = (row: LinkedRecord) => {
    const key = recordStatusKey(row);
    return tRoot.has(key) ? tRoot(key) : row.status;
  };
  return (
    <div className="space-y-4" data-slot="request-linked-records">
      <p className="text-xs leading-5 text-muted-foreground">{t("help")}</p>
      {totals.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{t("totalsTitle")}</p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("totals.material")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("totals.applied")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("totals.received")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("totals.outstanding")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("totals.returned")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("totals.issued")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {totals.map((row) => (
                  <tr key={`${row.material_name}|${row.specification}|${row.unit}`}>
                    <td className="px-3 py-2">
                      {row.material_name}
                      {row.specification ? <span className="text-muted-foreground"> · {row.specification}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{quantity(row.applied_quantity, row.unit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{quantity(row.received_quantity, row.unit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.over_quantity && Number(row.over_quantity) > 0
                        ? t("totals.overBy", { quantity: quantity(row.over_quantity, row.unit) })
                        : quantity(row.outstanding_quantity, row.unit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{quantity(row.returned_quantity, row.unit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{quantity(row.issued_quantity, row.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{t("totalsHelp")}</p>
        </div>
      ) : null}
      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("column.kind")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("column.reference")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("column.date")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("column.material")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("column.quantity")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("column.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map((row) => {
                const href = linkedRecordHref(row);
                return (
                  <tr
                    key={`${row.kind}-${row.id}`}
                    className="cursor-pointer align-top hover:bg-muted/40"
                    onClick={() => router.push(href)}
                    data-linked-record={row.kind}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{t(`kind.${row.kind}`)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={href} className="font-medium text-primary hover:underline" onClick={(event) => event.stopPropagation()}>
                        {row.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{df.date(row.date)}</td>
                    <td className="px-3 py-2">
                      <ul className="space-y-0.5">
                        {row.materials.map((item, index) => (
                          <li key={index}>
                            {item.material_name}
                            {item.specification ? <span className="text-muted-foreground"> · {item.specification}</span> : null}
                            {!item.in_request ? (
                              <span className="ml-1.5 rounded bg-warning/10 px-1.5 py-0.5 text-xs text-warning">{t("notInRequest")}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      <ul className="space-y-0.5">
                        {row.materials.map((item, index) => (
                          <li key={index}>
                            {quantity(item.quantity, item.unit)}
                            {item.applied_quantity !== null ? <span className="text-xs text-muted-foreground"> {t("appliedOnly")}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{status(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

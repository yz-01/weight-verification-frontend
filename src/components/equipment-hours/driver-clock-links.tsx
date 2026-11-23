"use client";

/**
 * 司机打卡链接 (J26-1, J26-6, item 125): the office makes one link per driver -
 * name, CIDB card, company, phone - copies it to WhatsApp, sends it again
 * (the old one stops, the phone is asked again) or stops it at once when the
 * driver leaves the project. The link itself is shown once, when it is made
 * or sent again; the server keeps only its fingerprint.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, IdCard, Link2, Loader2, Plus, RefreshCw, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OperatorExpiryTag, OperatorProfileWindow } from "@/components/equipment-hours/operator-profile-window";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { SupplierPicker } from "@/components/shared/supplier-picker";
import { Button } from "@/components/ui/button";
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
import { useDateFormat } from "@/lib/dates";
import {
  createDriverLink,
  listDriverLinks,
  reissueDriverLink,
  stopDriverLink,
  type DriverClockLink,
} from "@/services/driver-clock.service";

const TONE = { NOT_OPENED: "warning", IN_USE: "positive", STOPPED: "neutral" } as const;

export function DriverClockLinksDialog({
  project,
  onClose,
  prefill,
}: {
  project: string;
  onClose: () => void;
  /** 登记这位操作人员 (JB233): the new-link form opens with these words. */
  prefill?: { name: string; cidb: string };
}) {
  const t = useTranslations("driverClock");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const key = ["driver-clock-links", project] as const;
  const links = useQuery({ queryKey: key, queryFn: () => listDriverLinks(project || undefined) });
  // The address, shown once after making or sending again.
  const [shown, setShown] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(Boolean(prefill && project));
  // 操作人员资料 (JB233): the link whose papers are open.
  const [papersOf, setPapersOf] = useState<string | null>(null);
  const [error, setError] = useState("");
  // The row whose 重新发送 / 停用 is waiting for its 确定 (JB206-8).
  const [asking, setAsking] = useState<{ id: string; kind: DriverLinkAsk } | null>(null);

  const done = (row: DriverClockLink) => {
    if (row.url) {
      setShown({ name: row.driver_name, url: row.url });
      setCopied(false);
    }
    setAsking(null);
    setError("");
    void queryClient.invalidateQueries({ queryKey: ["driver-clock-links"] });
  };
  const failed = (reason: unknown) => setError(reason instanceof ApiError ? reason.message : t("office.failed"));
  const reissue = useMutation({ mutationFn: reissueDriverLink, onSuccess: done, onError: failed });
  const stop = useMutation({ mutationFn: stopDriverLink, onSuccess: done, onError: failed });

  const rows = links.data ?? [];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("office.title")}</DialogTitle>
          <DialogDescription>{t("office.help")}</DialogDescription>
        </DialogHeader>

        {shown ? (
          <section className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="driver-link-url">
            <p className="text-sm font-medium">{t("office.linkFor", { name: shown.name })}</p>
            <p className="break-all rounded bg-background px-2 py-1 font-mono text-xs">{shown.url}</p>
            <p className="text-xs text-muted-foreground">{t("office.shownOnce")}</p>
            {/* JB227: a link clocks only the machines bound to it. */}
            <p className="text-sm font-medium text-warning">{t("office.nextStep")}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(shown.url)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              <Copy />
              {copied ? t("office.copied") : t("office.copy")}
            </Button>
          </section>
        ) : null}

        {adding ? (
          <NewLinkForm
            project={project}
            prefill={prefill}
            onCancel={() => setAdding(false)}
            onMade={(row) => {
              setAdding(false);
              done(row);
            }}
          />
        ) : project ? (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            {t("office.add")}
          </Button>
        ) : (
          // A link belongs to one project: the page's own project chooser.
          <p className="text-sm text-muted-foreground">{t("office.chooseProject")}</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <QueryFailedNote query={links} what={t("office.title")} />
        {links.isSuccess && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("office.empty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {row.driver_name}
                    <StatusBadge label={t(`status.${row.status}`)} tone={TONE[row.status]} />
                    {/* JB233: a paper of his ran out. */}
                    <OperatorExpiryTag expiry={row.operator_expiry} />
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[row.cidb_no ? `CIDB ${row.cidb_no}` : "", row.company_name, row.phone].filter(Boolean).join(" · ")}
                  </p>
                  {/* JB227: what this driver may clock (bound in 【设备绑定司机】). */}
                  {row.is_active ? (
                    row.machines?.length ? (
                      <p className="text-xs text-muted-foreground">
                        {t("office.machines", {
                          machines: row.machines
                            .map((machine) =>
                              tRoot("equipmentHours.phone.machineLine", { number: machine.number, name: machine.name }),
                            )
                            .join(tRoot("equipmentHours.phone.boundJoin")),
                        })}
                      </p>
                    ) : (
                      <p className="text-xs font-medium text-warning">{t("office.noMachines")}</p>
                    )
                  ) : null}
                  {row.last_used_at ? (
                    <p className="text-xs text-muted-foreground">
                      {t("office.lastUsed", { at: df.dateTime(row.last_used_at) })}
                    </p>
                  ) : null}
                </div>
                <Button size="sm" variant="outline" onClick={() => setPapersOf(row.id)}>
                  <IdCard />
                  {tRoot("equipmentHours.papers.papersLink")}
                </Button>
                <DriverLinkActions
                  active={row.is_active}
                  asking={asking?.id === row.id ? asking.kind : null}
                  pending={reissue.isPending || stop.isPending}
                  onAsk={(kind) => setAsking({ id: row.id, kind })}
                  onCancel={() => setAsking(null)}
                  onConfirm={(kind) => (kind === "reissue" ? reissue.mutate(row.id) : stop.mutate(row.id))}
                />
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("office.close")}
          </Button>
        </DialogFooter>
        {papersOf ? <OperatorProfileWindow link={papersOf} onClose={() => setPapersOf(null)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** What a row's 确定 is for: 重新发送 or 停用. */
export type DriverLinkAsk = "reissue" | "stop";

/**
 * A link's 重新发送 and 停用, each asked once before it acts.
 *
 * One tap did either (JB206-8, Lucas 11-16 audit): 重新发送 stops the link
 * the driver has now, and 停用 stops it outright. So the first tap asks, in
 * the row, saying what will happen, and only 确定 acts.
 */
export function DriverLinkActions({
  active,
  asking,
  pending,
  onAsk,
  onCancel,
  onConfirm,
}: {
  active: boolean;
  asking: DriverLinkAsk | null;
  pending: boolean;
  onAsk: (kind: DriverLinkAsk) => void;
  onCancel: () => void;
  onConfirm: (kind: DriverLinkAsk) => void;
}) {
  const t = useTranslations("driverClock");
  if (asking) {
    return (
      <div className="flex flex-col gap-2 sm:max-w-xs" data-driver-link-ask={asking}>
        <p role="alert" className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-xs">
          {t(asking === "reissue" ? "office.askReissue" : "office.askStop")}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={asking === "stop" ? "destructive" : "default"}
            disabled={pending}
            disabledReason={t("office.working")}
            onClick={() => onConfirm(asking)}
          >
            {pending ? <Loader2 className="animate-spin" /> : asking === "reissue" ? <RefreshCw /> : <Square />}
            {t(asking === "reissue" ? "office.confirmReissue" : "office.confirmStop")}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} disabledReason={t("office.working")} onClick={onCancel}>
            {t("office.cancel")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => onAsk("reissue")}>
        <RefreshCw />
        {t("office.sendAgain")}
      </Button>
      {active ? (
        <Button size="sm" variant="outline" onClick={() => onAsk("stop")}>
          <Square />
          {t("office.stop")}
        </Button>
      ) : null}
    </div>
  );
}

function NewLinkForm({
  project,
  prefill,
  onCancel,
  onMade,
}: {
  project: string;
  prefill?: { name: string; cidb: string };
  onCancel: () => void;
  onMade: (row: DriverClockLink) => void;
}) {
  const t = useTranslations("driverClock");
  const [name, setName] = useState(prefill?.name ?? "");
  const [cidb, setCidb] = useState(prefill?.cidb ?? "");
  const [supplier, setSupplier] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const make = useMutation({
    mutationFn: () =>
      createDriverLink({
        project,
        driver_name: name.trim(),
        cidb_no: cidb.trim(),
        supplier: supplier || null,
        company_name: supplier ? "" : company.trim(),
        phone: phone.trim(),
      }),
    onSuccess: onMade,
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("office.failed")),
  });
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldWrapper label={t("office.driverName")} required>
          <Input value={name} maxLength={150} onChange={(event) => setName(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("office.cidb")}>
          <Input value={cidb} maxLength={50} onChange={(event) => setCidb(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("office.company")} required hint={t("office.companyHint")}>
          <SupplierPicker
            value={supplier}
            onChange={(id) => setSupplier(id)}
            placeholder={t("office.companyTyped")}
            allowNone
            noneLabel={t("office.companyTyped")}
          />
        </FieldWrapper>
        {!supplier ? (
          <FieldWrapper label={t("office.companyName")} required>
            <Input value={company} maxLength={200} onChange={(event) => setCompany(event.target.value)} />
          </FieldWrapper>
        ) : null}
        <FieldWrapper label={t("office.phone")} required hint={t("office.phoneHint")}>
          <Input type="tel" value={phone} maxLength={40} onChange={(event) => setPhone(event.target.value)} />
        </FieldWrapper>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t("office.cancel")}
        </Button>
        <Button
          disabled={make.isPending}
          requires={[
            [name.trim(), t("office.driverName")],
            [supplier || company.trim(), t("office.company")],
            [phone.trim(), t("office.phone")],
          ]}
          onClick={() => make.mutate()}
        >
          {make.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
          {t("office.make")}
        </Button>
      </div>
    </section>
  );
}

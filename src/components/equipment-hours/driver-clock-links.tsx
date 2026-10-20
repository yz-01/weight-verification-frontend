"use client";

/**
 * 司机打卡链接 (J26-1, J26-6, item 125): the office makes one link per driver -
 * name, CIDB card, company, phone - copies it to WhatsApp, sends it again
 * (the old one stops, the phone is asked again) or stops it at once when the
 * driver leaves the project. The link itself is shown once, when it is made
 * or sent again; the server keeps only its fingerprint.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2, Plus, RefreshCw, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

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

export function DriverClockLinksDialog({ project, onClose }: { project: string; onClose: () => void }) {
  const t = useTranslations("driverClock");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const key = ["driver-clock-links", project] as const;
  const links = useQuery({ queryKey: key, queryFn: () => listDriverLinks(project || undefined) });
  // The address, shown once after making or sending again.
  const [shown, setShown] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const done = (row: DriverClockLink) => {
    if (row.url) {
      setShown({ name: row.driver_name, url: row.url });
      setCopied(false);
    }
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
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[row.cidb_no ? `CIDB ${row.cidb_no}` : "", row.company_name, row.phone].filter(Boolean).join(" · ")}
                  </p>
                  {row.last_used_at ? (
                    <p className="text-xs text-muted-foreground">
                      {t("office.lastUsed", { at: df.dateTime(row.last_used_at) })}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reissue.isPending}
                    onClick={() => reissue.mutate(row.id)}
                  >
                    <RefreshCw />
                    {t("office.sendAgain")}
                  </Button>
                  {row.is_active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={stop.isPending}
                      onClick={() => stop.mutate(row.id)}
                    >
                      <Square />
                      {t("office.stop")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("office.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewLinkForm({
  project,
  onCancel,
  onMade,
}: {
  project: string;
  onCancel: () => void;
  onMade: (row: DriverClockLink) => void;
}) {
  const t = useTranslations("driverClock");
  const [name, setName] = useState("");
  const [cidb, setCidb] = useState("");
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

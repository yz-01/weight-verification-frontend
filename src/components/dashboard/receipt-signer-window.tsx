"use client";

/**
 * 签收人 on 「最新材料进场记录」 (JB234, 客户 11-20 事项 6):
 *
 *   「请在每条材料进场记录中显示实际签收人员的头像。头像必须关联该笔材料进场的实际签收人，
 *   不能显示提交人或其他人员的头像。点击头像或签收人姓名，可以查看签收人员资料及该笔签收
 *   记录。如果没有签收人头像，则显示姓名或默认头像，不可使用其他人的头像代替。」
 *
 * The picture is the signing account's (`signer.avatar`, sent only from
 * `received_by` - never the recorder's or the 验收 person's); without one, the
 * name's initials in a plain circle. Nobody signed: 「未签收」, no circle.
 * Clicking the circle or the name opens `ReceiptSignerWindow`: who signed (the
 * picture large, name, 身份 / 职位, company, a number to call when the server
 * sends one) and the signing itself (number, material and quantity, 签收时间,
 * the receiver's signature, 验收状态 and 验收人), with 【打开这笔材料进场】 -
 * the delivery's own window, all its photos in their order.
 */

import { ExternalLink, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProjectOverview, ReceiptSigner } from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type LatestReceiptRow = NonNullable<ProjectOverview["latest_receipts"]>[number];

/** The name's first letters, for a signer with no picture. */
export function signerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The signer's circle: the signing account's picture, else the initials. A
 * picture that fails to load falls back to the initials too - never to
 * anybody else's.
 */
export function SignerAvatar({ signer, size = "sm" }: { signer: ReceiptSigner; size?: "sm" | "lg" }) {
  const [broken, setBroken] = useState(false);
  const pixels = size === "lg" ? 64 : 28;
  const box = size === "lg" ? "size-16 text-lg" : "size-7 text-2xs";
  if (signer.avatar && !broken) {
    return (
      <Image
        src={signer.avatar}
        alt=""
        width={pixels}
        height={pixels}
        unoptimized
        data-signer-avatar="photo"
        onError={() => setBroken(true)}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-panel-border", box)}
      />
    );
  }
  return (
    <span
      aria-hidden
      data-signer-avatar="initials"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary/12 font-semibold text-primary ring-1 ring-panel-border",
        box,
      )}
    >
      {signerInitials(signer.name)}
    </span>
  );
}

/** The 签收人 in a row: circle and name, one button that opens the window. */
export function SignerButton({ signer, onOpen }: { signer: ReceiptSigner | undefined; onOpen: () => void }) {
  const t = useTranslations("projectReference.signer");
  if (!signer || !signer.name) {
    return (
      <span className="shrink-0 text-xs text-muted-foreground" data-receipt-signer="none">
        {t("notSigned")}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("open", { name: signer.name })}
      data-receipt-signer={signer.user_id ? "account" : "name"}
      className="inline-flex min-w-0 max-w-full shrink-0 items-center gap-1.5 rounded-full py-0.5 pr-2 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary pointer-coarse:min-h-11 sm:max-w-40"
    >
      <SignerAvatar signer={signer} />
      <span className="min-w-0 break-words font-medium sm:truncate">{signer.name}</span>
    </button>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * What the window shows: the signer, then the signing. Drawn on its own so a
 * test reads it without opening a dialog.
 */
export function ReceiptSignerPanel({
  row,
  onOpenReceipt,
}: {
  row: LatestReceiptRow;
  onOpenReceipt: () => void;
}) {
  const t = useTranslations("projectReference.signer");
  const status = useTranslations("materialAcceptance");
  const units = useTranslations("receipts.unit");
  const df = useDateFormat();
  const signer = row.signer;
  if (!signer) return null;
  return (
    <div className="space-y-4" data-receipt-signer-panel>
      <section className="flex min-w-0 items-center gap-3">
        <SignerAvatar signer={signer} size="lg" />
        <div className="min-w-0 space-y-0.5">
          <p className="break-words text-base font-semibold">{signer.name || t("notSigned")}</p>
          {signer.title ? <p className="break-words text-xs text-muted-foreground">{signer.title}</p> : null}
          {signer.company ? <p className="break-words text-xs text-muted-foreground">{signer.company}</p> : null}
        </div>
      </section>
      {signer.user_id ? null : (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground" data-signer-no-account>
          {t("noAccount")}
        </p>
      )}
      {signer.phone ? (
        <a
          href={`tel:${signer.phone.replace(/[^+\d]/g, "")}`}
          aria-label={t("phone")}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm text-primary hover:border-primary/50 hover:bg-accent pointer-coarse:h-11"
        >
          <Phone className="size-4" />
          <span className="tabular-nums">{signer.phone}</span>
        </a>
      ) : null}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("record")}</h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label={t("receiptNo")}>{row.receipt_no}</Fact>
          <Fact label={t("material")}>
            {[row.material, `${Number(row.quantity)} ${units.has(row.unit) ? units(row.unit) : row.unit}`]
              .filter(Boolean)
              .join(" · ")}
          </Fact>
          <Fact label={t("signedAt")}>{signer.signed_at ? df.dateTime(signer.signed_at) : "—"}</Fact>
          <Fact label={t("acceptance")}>
            {status.has(row.acceptance_status) ? status(row.acceptance_status) : row.acceptance_status}
          </Fact>
          <Fact label={t("acceptedBy")}>
            {row.accepted_by_name
              ? [row.accepted_by_name, row.accepted_at ? df.dateTime(row.accepted_at) : ""].filter(Boolean).join(" · ")
              : "—"}
          </Fact>
        </dl>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("signature")}</p>
          {row.signature_url ? (
            <div className="relative h-28 w-full max-w-xs overflow-hidden rounded-lg bg-paper ring-1 ring-panel-border">
              <Image
                src={row.signature_url}
                alt={t("signature")}
                fill
                sizes="320px"
                unoptimized
                className="object-contain"
                data-signer-signature
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noSignature")}</p>
          )}
        </div>
      </section>
      <Button variant="outline" onClick={onOpenReceipt} data-signer-open-receipt className="w-full sm:w-auto">
        <ExternalLink />
        {t("openReceipt")}
      </Button>
    </div>
  );
}

/** The small window over the dashboard (not a record window: no …Detail name). */
export function ReceiptSignerWindow({
  row,
  onClose,
  onOpenReceipt,
}: {
  row: LatestReceiptRow;
  onClose: () => void;
  onOpenReceipt: () => void;
}) {
  const t = useTranslations("projectReference.signer");
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md" data-receipt-signer-window>
        <DialogHeader>
          <DialogTitle>{t("windowTitle")}</DialogTitle>
          <DialogDescription>{t("windowDescription", { receipt: row.receipt_no })}</DialogDescription>
        </DialogHeader>
        <ReceiptSignerPanel row={row} onOpenReceipt={onOpenReceipt} />
      </DialogContent>
    </Dialog>
  );
}

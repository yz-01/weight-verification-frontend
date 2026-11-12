"use client";

/**
 * A send's three states, each with its time (JB178, 客户 11-12 追加 1: 「点击分享
 * 不等于发送成功，必须正确区分分享链接已生成、已打开 WhatsApp 和实际发送状态」):
 *
 * 1. 「分享链接已生成 · 时间」 - when the private link was made (only a send
 *    that has one: `link_created_at`);
 * 2. 「已打开 WhatsApp · 时间」 (电邮 / 分享窗口 / 复制链接 / 下载文件) - the
 *    button pressed in MSE Trace (`opened_via`), at `created_at`;
 * 3. 「实际发送：」 「还没有确认发出」, 「已确认发送 · 谁 · 时间」 (a person's
 *    「已发送」: `confirmed_by_name`, `confirmed_at`) and / or 「对方已打开链接 ·
 *    时间」 (`opened_at`).
 *
 * One wording for 操作记录, a record's 发送记录 and the send window. Pressing
 * a button never reads as sent: only line 3 says so, and only for a person's
 * answer or the recipient's open.
 */

import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/shared/page-primitives";
import type { FileShare, FileShareChannel } from "@/interfaces/file-action";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";

type ShareStates = Pick<
  FileShare,
  | "created_at"
  | "method"
  | "status"
  | "confirmed_at"
  | "confirmed_by_name"
  | "has_link"
  | "link_created_at"
  | "opened_at"
  | "open_count"
  | "opened_via"
>;

/** The button a send was made with; an older send, by its method. */
export function openedVia(share: Pick<FileShare, "opened_via" | "method">): FileShareChannel {
  if (share.opened_via) return share.opened_via;
  if (share.method === "WHATSAPP") return "whatsapp";
  if (share.method === "EMAIL") return "email";
  if (share.method === "DOWNLOAD") return "download";
  return "share_sheet";
}

/** What line 3 says: none of these is a button press. */
export function actualSendKeys(share: Pick<ShareStates, "status" | "confirmed_by_name" | "opened_at">) {
  const keys: Array<"confirmed" | "confirmedNoName" | "openedLink" | "notYet"> = [];
  if (share.status === "CONFIRMED" && share.confirmed_by_name) keys.push("confirmed");
  if (share.opened_at) keys.push("openedLink");
  if (share.status === "CONFIRMED" && !share.confirmed_by_name && !share.opened_at) keys.push("confirmedNoName");
  if (keys.length === 0) keys.push("notYet");
  return keys;
}

export function SendStates({ share, className }: { share: ShareStates; className?: string }) {
  const t = useTranslations("fileActions.send");
  const formatter = useDateFormat();
  const when = (value: string | null | undefined) => (value ? formatter.dateTime(value) : "");
  const linkMade = share.link_created_at ?? (share.has_link ? share.created_at : null);
  return (
    <div className={cn("space-y-0.5 text-xs", className)} data-send-states>
      {linkMade ? (
        <p className="text-muted-foreground" data-send-state="link">
          {t("states.linkMade", { when: when(linkMade) })}
        </p>
      ) : null}
      <p className="text-muted-foreground" data-send-state="opened">
        {t(`states.opened.${openedVia(share)}`, { when: when(share.created_at) })}
      </p>
      <div className="flex flex-wrap items-center gap-1" data-send-state="actual">
        <span className="text-muted-foreground">{t("states.actual")}</span>
        {actualSendKeys(share).map((key) => (
          <StatusBadge
            key={key}
            tone={key === "notYet" ? "warning" : "positive"}
            label={
              key === "notYet"
                ? t("status.OPENED")
                : key === "confirmed"
                  ? t("states.confirmed", { name: share.confirmed_by_name, when: when(share.confirmed_at) })
                  : key === "confirmedNoName"
                    ? t("states.confirmedNoName", { when: when(share.confirmed_at) })
                    : `${t("states.openedLink", { when: when(share.opened_at) })}${
                        (share.open_count ?? 1) > 1 ? t("log.openedCount", { count: share.open_count ?? 1 }) : ""
                      }`
            }
          />
        ))}
      </div>
    </div>
  );
}

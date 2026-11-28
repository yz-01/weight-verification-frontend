"use client";

/**
 * 三方独立签字审批 on the package window (JB309-5, 客户 11-28l 第 5、6 点):
 * 「项目经理：确认实际施工内容及现场证据。QS 或授权审核负责人：核对申请金额、施工
 * 分类及历史工程款申请。总部授权负责人：最终审核及批准金额。三方必须使用不同账号及
 * 各自的六位数签核密码，按顺序完成签字确认」 - and 「三方签字完成后，由项目经理确认
 * 完毕并归档」.
 *
 * Only a subcontractor's Progress Claim has `three_party` (the server decides).
 * Every round is kept, newest first: who signed each of the three steps, when,
 * the result, the opinion and the drawn signature; a returned round stays as it
 * was. The order and the three different accounts are the server's rules.
 */

import { useTranslations } from "next-intl";

import type {
  ThreePartyRound,
  ThreePartyStep,
  ThreePartyView,
  ThreePartyWaiting,
} from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";

const STEPS = ["manager", "qs", "headquarters"] as const;

/** Why this reader's QS / head-office review cannot go now, in words. */
export function ThreePartyWaitingNote({ waiting }: { waiting: ThreePartyWaiting | null | undefined }) {
  const words = useTranslations("jb309f");
  if (!waiting) return null;
  return (
    <p
      className="rounded-lg border border-dashed border-panel-border bg-muted/30 p-3 text-sm"
      data-three-party-waiting={waiting}
    >
      {words(`waiting.${waiting}`)}
    </p>
  );
}

function Step({ step, index, row }: { step: (typeof STEPS)[number]; index: number; row: ThreePartyStep | null }) {
  const words = useTranslations("jb309f");
  const loop = useTranslations("jb252");
  const formatter = useDateFormat();
  return (
    <li className="min-w-0 space-y-1 rounded-lg border p-3 text-sm" data-three-party-step={step}>
      <p className="font-medium">
        {index + 1}. {words(`step.${step}`)}
      </p>
      <p className="text-xs text-muted-foreground">{words(`stepHelp.${step}`)}</p>
      {row ? (
        <>
          <p
            className={`text-xs font-medium ${
              row.action === "RETURNED" ? "text-destructive" : row.action === "CONFIRMED" ? "" : "text-primary"
            }`}
          >
            {loop(`signatures.action.${row.action}`)}
          </p>
          <p className="text-xs text-muted-foreground">
            {words("by", { name: row.signer_name || "—", when: formatter.dateTime(row.signed_at) })}
          </p>
          {row.opinion && <p className="break-words text-xs">{words("opinion", { text: row.opinion })}</p>}
          {row.signature_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.signature_url}
              alt={loop("signatures.picture")}
              className="h-12 max-w-40 rounded border border-panel-border bg-paper object-contain p-1"
            />
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{words("notSigned")}</p>
      )}
    </li>
  );
}

function Round({ round }: { round: ThreePartyRound }) {
  const words = useTranslations("jb309f");
  return (
    <li className="space-y-2" data-three-party-round={round.round_no}>
      <p className="text-xs font-medium text-muted-foreground">{words("round", { n: round.round_no })}</p>
      <ol className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <Step key={step} step={step} index={index} row={round[step]} />
        ))}
      </ol>
    </li>
  );
}

export function ThreePartyBlock({ view }: { view: ThreePartyView | null | undefined }) {
  const words = useTranslations("jb309f");
  if (!view) return null;
  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label={words("title")} data-three-party>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{words("title")}</h3>
        <p className="text-xs text-muted-foreground">{words("order")}</p>
      </div>
      <p
        className={`rounded-lg p-2 text-sm ${
          view.next === "RESUBMIT"
            ? "border border-destructive/30 bg-destructive/5"
            : "border border-primary/30 bg-primary/5"
        }`}
        data-three-party-next={view.next}
      >
        {words(`next.${view.next}`, { name: view.qs_name })}
      </p>
      <ul className="space-y-3">
        {view.rounds.map((round) => (
          <Round key={round.round_no} round={round} />
        ))}
      </ul>
    </section>
  );
}

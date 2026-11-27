"use client";

import { useTranslations } from "next-intl";

/** Another active identity on the same phone number (JB246 / JB247). */
export interface OtherIdentity {
  /** "driver" for a 司机打卡链接, else the 现场人员 role code. */
  kind: string;
  name: string;
}

const KINDS = new Set(["driver", "site_staff", "equipment_operator", "gate_guard"]);

/**
 * 「同一个电话号码不能同时拥有多个有效司机身份」「同一电话号码不能通过更换姓名重复注册不同
 * 人员身份」 (客户 11-23 事项 18、19). The server refuses a new one; a number that
 * already had two before the rule is marked on the office's lists, naming the
 * other, so the office stops the one not wanted. Nothing is stopped by itself.
 */
export function OtherIdentitiesNote({ others }: { others?: OtherIdentity[] | null }) {
  const t = useTranslations("jb246");
  const tRoot = useTranslations();
  if (!others?.length) return null;
  const names = others
    .map((other) =>
      t("identity", {
        name: other.name,
        kind: t(`kind.${KINDS.has(other.kind) ? other.kind : "other"}`),
      }),
    )
    .join(tRoot("equipmentHours.phone.boundJoin"));
  return (
    <p className="text-xs font-medium text-destructive" data-testid="other-identities">
      {t("sameNumber", { names })}
    </p>
  );
}

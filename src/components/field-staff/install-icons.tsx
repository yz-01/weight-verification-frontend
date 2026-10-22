"use client";

import { Ellipsis, EllipsisVertical, Menu, Share, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * The real buttons, drawn inside a sentence.
 *
 * Icon *characters* in message text (「□↑」「⋯」) render as a broken box on
 * iPhone fonts and overlap the words around them (Lucas 2026-10-23, the
 * ready page). Messages mark the spot with `<share></share>`,
 * `<more></more>`, `<pagemenu></pagemenu>` or `<menu></menu>` and these tags draw the icon, sized to
 * the text and named for screen readers.
 */
function InlineIcon({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <Icon
      role="img"
      aria-label={label}
      data-inline-icon={label}
      className="mx-0.5 inline-block size-[1.15em] shrink-0 align-[-0.2em] text-primary"
      strokeWidth={2.25}
    />
  );
}

export type InstallIconTags = {
  share: () => React.ReactNode;
  more: () => React.ReactNode;
  menu: () => React.ReactNode;
  pagemenu: () => React.ReactNode;
};

/** Tag handlers for `t.rich` on the install / sign-in help messages. */
export function useInstallIconTags(): InstallIconTags {
  const t = useTranslations("fieldAccess");
  return {
    share: () => <InlineIcon icon={Share} label={t("iconShare")} />,
    more: () => <InlineIcon icon={Ellipsis} label={t("iconMore")} />,
    menu: () => <InlineIcon icon={EllipsisVertical} label={t("iconMenu")} />,
    // iOS 26 Safari's compact bar: the page menu at the left of the address.
    pagemenu: () => <InlineIcon icon={Menu} label={t("iconPageMenu")} />,
  };
}

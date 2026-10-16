import { useTranslations } from "next-intl";

import type { Refusal } from "@/lib/attachment-picker";
import { allowedLabel } from "@/lib/attachment-whitelist";

/**
 * The picker's 「这种文件不能上传」 sentence with what IS allowed (I37, I40):
 * hand it to `AttachmentPicker`'s `refusalText`. Other refusals (size, count)
 * keep the picker's own wording.
 */
export function useAllowedTypeRefusal(accept: string) {
  const t = useTranslations("attachmentPicker");
  return (item: Refusal): string | undefined =>
    item.kind === "type" ? t("wrongTypeAllowed", { name: item.name, allowed: allowedLabel(accept) }) : undefined;
}

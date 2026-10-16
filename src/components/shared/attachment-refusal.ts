import { useTranslations } from "next-intl";

import type { Refusal } from "@/lib/attachment-picker";
import { allowedLabel } from "@/lib/attachment-whitelist";

/**
 * The picker's 「这种文件不能上传」 sentence with what IS allowed (I37, I40):
 * hand it to `AttachmentPicker`'s `refusalText`. Other refusals (size, count)
 * keep the picker's own wording - except on a site worker's phone
 * (``phone``), where a file too big says what to do: upload it from the
 * office computer (P-phonefix).
 */
export function useAllowedTypeRefusal(accept: string, { phone = false }: { phone?: boolean } = {}) {
  const t = useTranslations("attachmentPicker");
  return (item: Refusal): string | undefined => {
    if (item.kind === "type") return t("wrongTypeAllowed", { name: item.name, allowed: allowedLabel(accept) });
    if (phone && (item.kind === "size" || item.kind === "total")) return t("phoneTooBig", { name: item.name });
    return undefined;
  };
}

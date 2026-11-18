"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { CreateRole } from "@/components/roles/create-role";
import { ViewRole } from "@/components/roles/view-role";
import { FormSkeleton, LoadErrorCard } from "@/components/shared/form-shell";
import { useFormSurface } from "@/components/shared/form-surface";
import { DialogTitle } from "@/components/ui/dialog";
import { getRole } from "@/services/users.service";

/** Fetches the record, then hands it to the shared form. */
export function EditRole({ id }: { id: string }) {
  const t = useTranslations();
  const surface = useFormSurface();
  const { data, isLoading, isLoadingError } = useQuery({
    queryKey: ["roles", "detail", id],
    queryFn: () => getRole(id),
  });

  if (isLoading) return <FormSkeleton sections={2} />;
  if (isLoadingError || !data) {
    return <LoadErrorCard backHref="/roles" backLabel={t("roles.title")} />;
  }
  // A phone role is made and chosen in 现场人员管理 (JB219, 客户 11-06): reached
  // by a link, it is shown read-only and says where it lives.
  if (data.kind === "phone") {
    return (
      // Fills the edit dialog's three rows and scrolls inside it.
      <div className="row-span-3 min-h-0 overflow-y-auto" data-phone-role-readonly>
        {surface === "dialog" ? <DialogTitle className="sr-only">{t("roles.viewTitle")}</DialogTitle> : null}
        <ViewRole id={id} />
      </div>
    );
  }
  return <CreateRole role={data} />;
}

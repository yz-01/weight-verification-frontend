"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { LoadFailed, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { roleDescription, roleName } from "@/lib/role-labels";
import { createRoleFromTemplate, getRoleTemplates } from "@/services/users.service";

/**
 * 「从预设新增」 (I34): the preset roles this company does not have yet.
 *
 * Lucas: 「请把所有角色弄一个预设，这样我就不用自己新增」. New companies start
 * with all of them; this is for a preset deleted by mistake, or one the
 * platform added after the company was opened. Each is added exactly as a new
 * company gets it - name, description and permissions - and can be edited
 * like any other role afterwards. The dialog stays open, so several can be
 * added in a row; an added one leaves the list.
 */
export function AddPresetRoleDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [addingCode, setAddingCode] = useState<string | null>(null);

  const templates = useQuery({
    queryKey: ["roles", "templates"],
    queryFn: getRoleTemplates,
  });

  const adding = useMutation({
    mutationFn: (code: string) => createRoleFromTemplate(code),
    onMutate: (code) => setAddingCode(code),
    onSettled: () => {
      setAddingCode(null);
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const rows = templates.data ?? [];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[560px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("roles.preset.title")}</DialogTitle>
          <DialogDescription>{t("roles.preset.description")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {templates.isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))
          ) : templates.isError ? (
            <LoadFailed
              what={t("roles.preset.what")}
              onRetry={() => void templates.refetch()}
            />
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {t("roles.preset.empty")}
            </p>
          ) : (
            rows.map((template) => {
              const busy = adding.isPending && addingCode === template.code;
              return (
                <div
                  key={template.code}
                  className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {roleName(template, t)}
                      </span>
                      <TypeBadge
                        label={t("roles.permissionCount", {
                          count: template.permissions.length,
                        })}
                      />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {roleDescription(template, t)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 rounded-full px-4"
                    disabled={adding.isPending}
                    onClick={() => adding.mutate(template.code)}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {t("roles.preset.add")}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onClose}
          >
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

/**
 * 每个项目的「可用供应商」 (JB115, 客户 11-06 第二轮事项 2 第 2 点).
 *
 * 「总部统一管理供应商、生成二维码，并决定哪些供应商可以提供给各个项目使用。项目部在
 * 「供应商」栏目中可以新增供应商，但只能从总部已经选定的供应商名单中选择，加入自己的
 * 项目，不能自行建立总部名单以外的新供应商。现场人员负责扫码核实供应商身份及材料收货。」
 *
 * The project page's card lists the project's suppliers. 「从总部名单选」 (head
 * office and the project's manager, ``project_supplier.manage``) puts
 * suppliers from head office's list on it; 「移出」 takes one off. A receipt,
 * a delivery note, a site code and a supplier scan on the project take only
 * these suppliers - the server says so when one is not.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus, Search, Truck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, LoadFailed } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  addProjectSuppliers,
  getProjects,
  getProjectSuppliers,
  getSuppliers,
  removeProjectSupplier,
  type ProjectSupplierRow,
} from "@/services/contractor.service";

const MANAGE = "project_supplier.manage";

export function ProjectSuppliersPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("projectSuppliers");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectSupplierRow | null>(null);
  const list = useQuery({
    queryKey: ["project-suppliers", projectId],
    queryFn: () => getProjectSuppliers({ project: projectId }),
  });
  const removal = useMutation({
    mutationFn: (row: ProjectSupplierRow) => removeProjectSupplier(row.id),
    onSuccess: () => {
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ["project-suppliers"] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
  const rows = list.data?.results ?? [];
  const mayManage = can(MANAGE);

  return (
    <div id="project-suppliers" className="surface-panel rounded-xl" data-testid="project-suppliers">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {mayManage && (
          <Button size="sm" className="shrink-0 rounded-full px-4 shadow-sm" onClick={() => setAdding(true)}>
            <ListPlus className="h-4 w-4" />
            {t("add")}
          </Button>
        )}
      </div>
      <div className="divide-y border-t">
        {list.isLoading ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : list.isError ? (
          <LoadFailed className="m-4" what={t("what")} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-4 px-6 py-3" data-testid="project-supplier-row">
              <div className="flex min-w-0 items-center gap-3">
                <Truck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{row.supplier_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.supplier_code}
                    {row.added_by_name ? ` · ${t("addedBy", { name: row.added_by_name })}` : ""}
                  </p>
                </div>
              </div>
              {mayManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:bg-destructive/10"
                  onClick={() => setRemoving(row)}
                >
                  <X className="h-3.5 w-3.5" />
                  {t("remove")}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
      {adding && <AddFromHeadOfficeDialog projectId={projectId} onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t("removeTitle", { name: removing?.supplier_name ?? "" })}
        description={t("removeDescription")}
        confirmLabel={t("remove")}
        confirmIcon={X}
        isPending={removal.isPending}
        onConfirm={() => {
          if (removing) removal.mutate(removing);
        }}
      />
    </div>
  );
}

/**
 * 「从总部名单选」: suppliers from head office's list, ticked, put on a project.
 * Opened from a project (``projectId``) or from the supplier page, where the
 * project is chosen first - only the reader's own projects are offered.
 */
export function AddFromHeadOfficeDialog({
  projectId,
  onClose,
}: {
  projectId?: string;
  onClose: () => void;
}) {
  const t = useTranslations("projectSuppliers");
  const queryClient = useQueryClient();
  const [project, setProject] = useState(projectId ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const projects = useQuery({
    queryKey: ["projects", "project-suppliers-options"],
    queryFn: () => getProjects({ page_size: 500, sort_by: "name", sort_order: "asc" }),
    enabled: !projectId,
  });
  const choices = useQuery({
    queryKey: ["suppliers", "not-on-project", project, search.trim()],
    queryFn: () =>
      getSuppliers({
        page_size: 200,
        sort_by: "name",
        is_active: true,
        not_on_project: project,
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
    enabled: Boolean(project),
  });
  const save = useMutation({
    mutationFn: () => addProjectSuppliers(project, picked),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-suppliers"] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      onClose();
    },
  });
  const options = choices.data?.results ?? [];
  const toggle = (id: string, on: boolean) =>
    setPicked((current) => (on ? [...current, id] : current.filter((value) => value !== id)));

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-130" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addDescription")}</DialogDescription>
        </DialogHeader>
        {!projectId && (
          <FieldWrapper label={t("project")} required>
            <ProjectPicker
              value={project}
              onValueChange={(value) => {
                setProject(value);
                setPicked([]);
              }}
              placeholder={t("project")}
              projects={projects.data?.results}
              projectsLoading={projects.isLoading}
              projectsError={projects.isError}
              scope="own"
            />
          </FieldWrapper>
        )}
        {project && (
          <FieldWrapper label={t("suppliers")} required>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("search")}
                className="pl-9"
              />
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border" data-testid="hq-supplier-choices">
              {choices.isLoading ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
              ) : choices.isError ? (
                <LoadFailed className="m-3" what={t("what")} onRetry={() => void choices.refetch()} />
              ) : options.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("allOn")}</p>
              ) : (
                options.map((supplier) => (
                  <label
                    key={supplier.id}
                    className="flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
                  >
                    <Checkbox
                      checked={picked.includes(supplier.id)}
                      onCheckedChange={(checked) => toggle(supplier.id, checked === true)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{supplier.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{supplier.code}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </FieldWrapper>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X />
            {t("cancel")}
          </Button>
          <Button
            disabled={!project || picked.length === 0 || save.isPending}
            disabledReason={!project ? t("chooseProjectFirst") : t("chooseSupplierFirst")}
            requires={[
              [project, t("project")],
              [picked.length > 0 ? "yes" : "", t("suppliers")],
            ]}
            onClick={() => save.mutate()}
            data-testid="hq-supplier-add"
          >
            <ListPlus />
            {t("addCount", { count: picked.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

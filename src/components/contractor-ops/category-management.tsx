"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ListTree } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { ProjectFilter } from "@/components/contractor-ops/operations-workspaces";
import { useAuth } from "@/components/providers/auth-provider";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAssetCategories } from "@/services/asset.service";
import {
  getConstructionPhases,
  getProjectCategories,
} from "@/services/contractor-ops.service";
import { getDocumentCategories } from "@/services/document-workflow.service";
import { getWasteCategories } from "@/services/waste-outgoing.service";

/**
 * One screen for every module's categories, chosen from the left (D-125).
 *
 * 客户 2026-09-11：「这个设计有问题…把「栏目」设计成材料卡片，所以混凝土、钢管、
 * 门架都能放；但以后文件、设备、进度、EHS、废料等内容放进来就会很乱」，
 * 要求「左侧分类导航、右侧列表，不要继续现在这种大量卡片」，
 * 并定下规则：「材料不能和文件混在同一层展示，但可以统一由 Category Management
 * 管理。用户先选择所属模块，再看到该模块下面的栏目。」
 *
 * The part worth reading before changing this file: the nine lists below come
 * from five different tables, in three different scopes, and that is on
 * purpose (F-338, D-126). Documents are company-wide, equipment is
 * platform-wide, recyclable waste is company-wide, the weighted construction
 * stages and the project columns are per project - and real records point at
 * each of them through protected keys. Merging them into one table would move
 * data that is protected precisely because somebody's filing depends on it.
 *
 * So this screen presents; it does not own. Editing opens the module's own
 * maintenance screen, which is where the create and update endpoints already
 * live - a second editor here would be the same two-sources-of-truth problem
 * one level up.
 *
 * The scope is printed above the table rather than left to be discovered. A
 * document category edited from inside a project affects every project, and a
 * reader who assumes otherwise will change one and surprise somebody else.
 */

type Scope = "project" | "company" | "platform";

/** One category, however its own table spells it. */
interface Row {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  recordCount: number;
  /** Shown as a tail note, for the phases that carry progress weight. */
  note?: string;
}

interface Module {
  key: string;
  scope: Scope;
  /** Where this module's categories are created and edited today. */
  href: string;
  fetch: (project: string) => Promise<Row[]>;
  /**
   * The code an account must hold for this row to mean anything (F-367).
   *
   * Only the platform-scoped one needs it. Its list endpoint is behind
   * `IsPlatformStaff` *and* `asset.view`, which the catalogue offers to the
   * PLATFORM audience alone - so for a contractor the row could never open,
   * and neither could the "manage" link beside it. A row that always answers
   * "you are not allowed to do that" is not information about a vocabulary
   * that exists elsewhere; it is a dead end with a name on it.
   */
  permission?: string;
}

const columnRows = (kind: string) => async (project: string) => {
  const page = await getProjectCategories({
    project,
    kind: kind,
    page_size: 200,
    sort_by: "sort_order",
    sort_order: "asc",
  });
  return page.results.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.is_active,
    recordCount: row.record_count,
  }));
};

const MODULES: Module[] = [
  {
    key: "material",
    scope: "project",
    href: "/material-columns",
    fetch: columnRows("MATERIAL"),
  },
  {
    key: "field",
    scope: "project",
    href: "/project-categories",
    fetch: columnRows("FIELD"),
  },
  {
    key: "document",
    scope: "company",
    href: "/documents",
    fetch: async () => {
      const page = await getDocumentCategories({ page_size: 200 });
      return page.results.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.is_active,
        recordCount: row.record_count,
      }));
    },
  },
  {
    key: "equipment",
    scope: "platform",
    href: "/assets/categories",
    permission: "asset.view",
    fetch: async () => {
      const page = await getAssetCategories({ page_size: 200 });
      return page.results.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.is_active,
        recordCount: row.record_count,
      }));
    },
  },
  {
    key: "progress",
    scope: "project",
    href: "/project-categories",
    fetch: columnRows("PROGRESS"),
  },
  {
    // The other half of the customer's "Progress", and deliberately not
    // merged into the one above: a phase carries the weight the completion
    // percentage is computed against (D-127), so filing zones and floors as
    // phases would change the progress figures of projects that exist.
    key: "phase",
    scope: "project",
    href: "/progress",
    fetch: async (project: string) => {
      const page = await getConstructionPhases({ project, page_size: 200 });
      return page.results.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.is_active,
        recordCount: row.record_count,
        note: row.planned_weight,
      }));
    },
  },
  {
    key: "ehs",
    scope: "project",
    href: "/project-categories",
    fetch: columnRows("EHS"),
  },
  {
    key: "recycle",
    scope: "company",
    href: "/waste-outgoing",
    fetch: async () => {
      const page = await getWasteCategories({ page_size: 200 });
      return page.results.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.is_active,
        recordCount: row.record_count,
      }));
    },
  },
  {
    key: "debris",
    scope: "project",
    href: "/project-categories",
    fetch: columnRows("CONSTRUCTION_WASTE"),
  },
];

export function CategoryManagement() {
  const t = useTranslations("categoryManagement");
  const { can } = useAuth();
  const [selected, setSelected] = useState(MODULES[0].key);
  const [project, setProject] = useState("");
  /*
   * Only the modules this account could actually open. Filtered rather than
   * greyed out: there is nothing behind the row to explain, and nothing the
   * reader could do to earn it - the code is not offered to their audience at
   * all (F-367).
   */
  const modules = MODULES.filter(
    (module) => !module.permission || can(module.permission),
  );
  const active =
    modules.find((module) => module.key === selected) ?? modules[0] ?? MODULES[0];
  const needsProject = active.scope === "project";

  const rows = useQuery({
    queryKey: ["category-management", active.key, project],
    queryFn: () => active.fetch(project),
    enabled: !needsProject || Boolean(project),
  });

  return (
    <div className="space-y-5">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      <ProjectFilter value={project} onChange={setProject} />
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        {/* The left-hand module list the customer asked for. A list of
            buttons rather than links: the table beside it is the page, so
            navigating away and back would lose the project filter. */}
        <nav aria-label={t("modules")} className="flex flex-col gap-1">
          {modules.map((module) => (
            <button
              key={module.key}
              type="button"
              onClick={() => setSelected(module.key)}
              aria-current={module.key === selected ? "true" : undefined}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                module.key === selected
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "bg-card hover:bg-muted/40"
              }`}
            >
              <ListTree className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {t(`module.${module.key}`)}
              </span>
            </button>
          ))}
        </nav>

        <section className="min-w-0">
          <header className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{t(`module.${active.key}`)}</h2>
            {/* Said out loud, not left to be discovered. */}
            <StatusBadge label={t(`scope.${active.scope}`)} tone="neutral" />
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link href={active.href}>
                <ExternalLink />
                {t("manage")}
              </Link>
            </Button>
          </header>
          <p className="mb-3 text-xs text-muted-foreground">
            {t(`moduleHelp.${active.key}`)}
          </p>

          {needsProject && !project ? (
            <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              {t("chooseProject")}
            </p>
          ) : rows.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : rows.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("failed")}
            </p>
          ) : !rows.data?.length ? (
            <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              {/* The shared table, so the padding, header and hover match
                  every other list on the platform - a probe checks for it,
                  and the reason it exists is that a hand-rolled one drifts. */}
              <Table className="min-w-[36rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("column.name")}</TableHead>
                    <TableHead>{t("column.code")}</TableHead>
                    <TableHead>{t("column.module")}</TableHead>
                    <TableHead className="text-right">
                      {t("column.records")}
                    </TableHead>
                    <TableHead>{t("column.status")}</TableHead>
                    <TableHead>{t("column.action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.name}
                        {/* The weight a phase carries, shown only where one
                            exists: D-127 asks for it to be visible which of
                            the two progress groups the percentage is measured
                            against, and this is that difference. */}
                        {row.note && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {t("weight", { weight: row.note })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.code}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(`module.${active.key}`)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.recordCount}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={t(row.isActive ? "active" : "inactive")}
                          tone={row.isActive ? "positive" : "neutral"}
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={active.href}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {t("edit")}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

"use client";

/**
 * 公司通用分类 › 材料分类（含规格） - the list (JB181, 客户 11-12 追加 4、追加 5).
 *
 * 「分类列表采用材料名称分组、规格展开／收起的方式，避免每个规格占一行」「平时只显示
 * 材料名称及规格数量，点击展开才显示全部规格」「公司通用分类只需要材料基础资料管理，
 * 不需要项目累计数量、金额等统计功能」. One row per material: 材料名称 | 单位 |
 * 规格 | 供应商 | 单价 | 状态 | 操作 - no record counts, quantities or totals.
 * Its specifications are folded under it; 【展开】 / 【收起】 say so in words
 * (Lucas 11-12 「怕客户不会用或者不明白」), and a click on the row does the same.
 * An unfolded specification is only shown here; it is changed on the
 * material's own page (【编辑】).
 */

import { ChevronDown, ChevronRight, ChevronUp, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUnitName } from "@/hooks/use-material-units";
import type { CompanyCategory, MaterialPriceSummary } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";

/** ``open`` with ``id`` opened, or closed when it was open. */
export function toggled(open: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(open);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** The rows the table shows: every material, and the specifications of the open ones. */
export function visibleRows(
  materials: readonly CompanyCategory[],
  open: ReadonlySet<string>,
): { row: CompanyCategory; material: CompanyCategory | null }[] {
  return materials.flatMap((material) => [
    { row: material, material: null },
    ...(open.has(material.id) ? (material.specs ?? []).map((spec) => ({ row: spec, material })) : []),
  ]);
}

/** A price as the client writes it: 「2,680.00」. */
export function money(value: string | null | undefined): string {
  const number = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) return value ?? "";
  return number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * 「供应商」: the names, 「、」 between them; more than two - 「甲、乙 等 N 家」;
 * none - 「没有选」 (做法 3).
 */
export function suppliersWords(
  suppliers: readonly { name: string }[] | undefined,
  joiner = "、",
): { key: "suppliersNone" } | { key: "suppliersList"; values: { names: string } } | {
  key: "suppliersMore";
  values: { names: string; count: number };
} {
  const names = (suppliers ?? []).map((supplier) => supplier.name);
  if (!names.length) return { key: "suppliersNone" };
  if (names.length <= 2) return { key: "suppliersList", values: { names: names.join(joiner) } };
  return { key: "suppliersMore", values: { names: names.slice(0, 2).join(joiner), count: names.length } };
}

/**
 * 「单价」 (做法 3): 「RM 2,680.00 / 吨」; a specification with no price of its
 * own - 「用材料的单价（RM 2,680.00 / 吨）」; neither - 「没有设单价」.
 */
export function priceWords(
  price: MaterialPriceSummary | null | undefined,
  materialPrice: MaterialPriceSummary | null | undefined,
  isSpec: boolean,
):
  | { key: "pricePer" | "priceUsesMaterial"; price: string; unit: string }
  | { key: "priceNone" } {
  const own = price?.current;
  if (own?.unit_price) return { key: "pricePer", price: money(own.unit_price), unit: own.unit };
  const material = isSpec ? materialPrice?.current : null;
  if (material?.unit_price) return { key: "priceUsesMaterial", price: money(material.unit_price), unit: material.unit };
  return { key: "priceNone" };
}

/** A click on the row itself, not on one of its buttons. */
const onRowItself = (target: EventTarget | null) =>
  !(target instanceof Element && target.closest("button, a, input, [role='switch']"));

export function SuppliersText({ suppliers }: { suppliers: CompanyCategory["suppliers"] }) {
  const t = useTranslations("categoryManagement.company");
  const words = suppliersWords(suppliers, t("suppliersJoiner"));
  if (words.key === "suppliersNone") return <span className="text-muted-foreground">{t("suppliersNone")}</span>;
  return <span>{words.key === "suppliersList" ? words.values.names : t("suppliersMore", words.values)}</span>;
}

export function PriceText({
  price,
  materialPrice,
  isSpec,
}: {
  price: MaterialPriceSummary | null | undefined;
  materialPrice?: MaterialPriceSummary | null;
  isSpec: boolean;
}) {
  const t = useTranslations("categoryManagement.company");
  const prices = useTranslations("materialPrices");
  const unitName = useUnitName();
  const when = useDateFormat();
  const words = priceWords(price, materialPrice, isSpec);
  return (
    <div className="space-y-0.5">
      <p className={`tabular-nums ${words.key === "pricePer" ? "" : "text-muted-foreground"}`}>
        {words.key === "priceNone" ? t("priceNone") : t(words.key, { price: words.price, unit: unitName(words.unit) })}
      </p>
      {/* A price set for a later day, as the project's list says it. */}
      {(price?.upcoming ?? []).map((next) => (
        <p key={next.id} className="text-xs text-warning">
          {prices("upcoming", { price: money(next.unit_price), unit: unitName(next.unit), date: when.date(next.effective_from) })}
        </p>
      ))}
    </div>
  );
}

export function CompanyMaterialList({
  materials,
  open,
  onToggle,
  canManage,
  showsPrices,
  onEdit,
  onAddSpec,
}: {
  materials: readonly CompanyCategory[];
  open: ReadonlySet<string>;
  onToggle: (id: string) => void;
  canManage: boolean;
  showsPrices: boolean;
  onEdit: (material: CompanyCategory) => void;
  onAddSpec: (material: CompanyCategory) => void;
}) {
  const t = useTranslations("categoryManagement");
  const unitName = useUnitName();
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("company.col.material")}</TableHead>
            <TableHead>{t("company.unit")}</TableHead>
            <TableHead>{t("company.col.specs")}</TableHead>
            <TableHead>{t("company.col.suppliers")}</TableHead>
            {showsPrices && <TableHead>{t("company.col.price")}</TableHead>}
            <TableHead>{t("column.status")}</TableHead>
            {canManage && <TableHead>{t("column.action")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows(materials, open).map(({ row, material }) => {
            const count = (row.specs ?? []).length;
            const folds = !material && count > 0;
            const isOpen = folds && open.has(row.id);
            return (
              <TableRow
                key={row.id}
                className={folds ? "cursor-pointer" : material ? "bg-muted/30" : undefined}
                onClick={
                  folds
                    ? (event) => {
                        if (onRowItself(event.target)) onToggle(row.id);
                      }
                    : undefined
                }
              >
                <TableCell className={material ? "" : "font-medium"}>
                  <span className={`flex items-center gap-1 ${material ? "pl-6" : ""}`}>
                    {material ? <span aria-hidden className="text-muted-foreground">└</span> : null}
                    {folds ? (
                      <ChevronRight
                        aria-hidden
                        className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                    ) : !material ? (
                      <span aria-hidden className="inline-block size-4 shrink-0" />
                    ) : null}
                    <span>{row.name}</span>
                  </span>
                  {!material && row.description ? (
                    <span className="block pl-5 text-xs font-normal text-muted-foreground">{row.description}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">
                  {row.default_unit ? unitName(row.default_unit) : material?.default_unit ? unitName(material.default_unit) : "—"}
                </TableCell>
                <TableCell>
                  {/* 「平时只显示材料名称及规格数量，点击展开才显示全部规格」 */}
                  {!material && (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">
                        {count ? t("company.specCount", { count }) : t("company.noSpecs")}
                      </span>
                      {folds && (
                        <Button size="sm" variant="outline" aria-expanded={isOpen} onClick={() => onToggle(row.id)}>
                          {isOpen ? <ChevronUp /> : <ChevronDown />}
                          {isOpen ? t("company.collapse") : t("company.expand")}
                        </Button>
                      )}
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-56 text-sm whitespace-normal">
                  <SuppliersText suppliers={row.suppliers} />
                </TableCell>
                {showsPrices && (
                  <TableCell className="text-sm">
                    <PriceText price={row.price} materialPrice={material?.price} isSpec={Boolean(material)} />
                  </TableCell>
                )}
                <TableCell>
                  <StatusBadge
                    label={t(row.is_active ? "active" : "inactive")}
                    tone={row.is_active ? "positive" : "neutral"}
                  />
                </TableCell>
                {canManage && (
                  <TableCell>
                    {/* A specification is only shown here: it is changed on its material's page. */}
                    {!material && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => onEdit(row)}>
                          <Pencil />
                          {t("edit")}
                        </Button>
                        {/* 「客户可以在这些基础分类上自行增加其他材料、规格」: the same page, a blank row waiting. */}
                        <Button size="sm" variant="ghost" onClick={() => onAddSpec(row)}>
                          <Plus />
                          {t("company.addSpec")}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

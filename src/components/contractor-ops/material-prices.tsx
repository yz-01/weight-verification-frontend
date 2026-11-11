"use client";

/**
 * 材料单价 (JB167, 客户 11-11).
 *
 * 「材料分类管理已经设定单价，材料每次进场时，系统必须根据材料名称、规格自动带出
 * 单价」「新价格从设定的生效日期开始使用」「之前已经确认的收货记录保留原来的价格」
 * 「每次调整价格必须保留历史，包括旧价格、新价格、修改人、修改时间及生效日期」.
 *
 * One dialog per material: the material and each specification, its price per
 * unit today, a price set for a later day (「X 起生效」), one button to set or
 * change it, and its 价格历史. Kept plain - the client is elderly: short
 * words, one obvious button per row. Saving asks for the user's own PIN
 * (`api-client` opens the dialog on the server's refusal); who set it is
 * whoever that PIN belongs to.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, Save, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUnitName } from "@/hooks/use-material-units";
import { ApiError } from "@/interfaces/api";
import type { MaterialPriceSummary } from "@/interfaces/contractor-ops";
import type { MaterialPriceEntry } from "@/interfaces/material-price";
import { useDateFormat } from "@/lib/dates";
import { isSignOffCancelled } from "@/lib/sign-off";
import {
  getMaterialPriceHistory,
  getMaterialPrices,
  setMaterialPrice,
} from "@/services/material-price.service";

/** A price as typed: above zero, at most two decimals. */
export function isValidUnitPrice(value: string): boolean {
  const text = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return false;
  return Number(text) > 0;
}

/**
 * 「单价 RM 650.00 / 吨」 under a material's name on the list, with a price set
 * for a later day after it. Nothing when there is no price to show.
 */
export function PriceLine({
  price,
  unit,
  unitLabel,
}: {
  price: MaterialPriceSummary | null | undefined;
  unit?: string;
  unitLabel?: string | null;
}) {
  const t = useTranslations("materialPrices");
  const when = useDateFormat();
  const unitName = useUnitName();
  if (!price || (!price.current?.unit_price && !price.upcoming.length)) return null;
  const name = (code: string) => unitName(code || unit || "", code === unit ? unitLabel : undefined);
  return (
    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
      {price.current?.unit_price
        ? t("listLine", { price: price.current.unit_price, unit: name(price.current.unit) })
        : t("listNone")}
      {price.upcoming.map((next) => (
        <span key={next.id}>
          {" · "}
          {t("upcoming", {
            price: next.unit_price ?? "—",
            unit: name(next.unit),
            date: when.date(next.effective_from),
          })}
        </span>
      ))}
    </p>
  );
}

type Mode = { kind: "list" } | { kind: "set"; entry: MaterialPriceEntry } | { kind: "history"; entry: MaterialPriceEntry };

export function MaterialPriceDialog({
  materialId,
  materialName,
  onClose,
}: {
  materialId: string;
  materialName: string;
  onClose: () => void;
}) {
  const t = useTranslations("materialPrices");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const prices = useQuery({
    queryKey: ["material-prices", materialId],
    queryFn: () => getMaterialPrices(materialId),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-5" />
            {t("title", { name: materialName })}
          </DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        {mode.kind === "set" ? (
          <SetPriceForm
            entry={mode.entry}
            today={prices.data?.today ?? ""}
            onDone={() => setMode({ kind: "list" })}
          />
        ) : mode.kind === "history" ? (
          <PriceHistory entry={mode.entry} onBack={() => setMode({ kind: "list" })} />
        ) : (
          <>
            <QueryFailedNote query={prices} what={t("what")} />
            {prices.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : prices.data ? (
              <PriceTable
                rows={prices.data.results}
                canManage={prices.data.can_manage}
                onSet={(entry) => setMode({ kind: "set", entry })}
                onHistory={(entry) => setMode({ kind: "history", entry })}
              />
            ) : null}
            <p className="text-xs text-muted-foreground">{t("keepsOld")}</p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                {t("close")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PriceTable({
  rows,
  canManage,
  onSet,
  onHistory,
}: {
  rows: MaterialPriceEntry[];
  canManage: boolean;
  onSet: (entry: MaterialPriceEntry) => void;
  onHistory: (entry: MaterialPriceEntry) => void;
}) {
  const t = useTranslations("materialPrices");
  const when = useDateFormat();
  const unitName = useUnitName();
  return (
    <div className="rounded-lg border">
      <Table fit>
        <TableHeader>
          <TableRow>
            <TableHead>{t("col.name")}</TableHead>
            <TableHead>{t("col.price")}</TableHead>
            <TableHead>{t("col.action")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((entry) => {
            const unit = unitName(entry.unit, entry.unit_label || null);
            return (
              <TableRow key={entry.category}>
                <TableCell className={entry.is_spec ? "pl-6" : "font-medium"}>
                  {entry.is_spec ? `└ ${entry.name}` : t("wholeMaterial", { name: entry.name })}
                </TableCell>
                <TableCell>
                  {!entry.priced_here ? (
                    <span className="text-xs text-muted-foreground">{t("typedOnRecord")}</span>
                  ) : (
                    <div className="space-y-0.5">
                      <p className="tabular-nums">
                        {entry.current?.unit_price
                          ? t("perUnit", { price: entry.current.unit_price, unit })
                          : entry.is_spec
                            ? t("usesMaterial")
                            : t("none")}
                      </p>
                      {entry.upcoming.map((next) => (
                        <p key={next.id} className="text-xs text-warning">
                          {t("upcoming", {
                            price: next.unit_price ?? "—",
                            unit,
                            date: when.date(next.effective_from),
                          })}
                        </p>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {entry.priced_here && (
                    <div className="flex flex-wrap items-center gap-1">
                      {canManage && (
                        <Button
                          size="sm"
                          disabled={!entry.unit}
                          disabledReason={entry.unit ? undefined : t("needsUnit")}
                          onClick={() => onSet(entry)}
                        >
                          <Tag />
                          {entry.current || entry.upcoming.length ? t("adjust") : t("set")}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => onHistory(entry)}>
                        <History />
                        {t("history")}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SetPriceForm({
  entry,
  today,
  onDone,
}: {
  entry: MaterialPriceEntry;
  today: string;
  onDone: () => void;
}) {
  const t = useTranslations("materialPrices");
  const unitName = useUnitName();
  const queryClient = useQueryClient();
  const unit = unitName(entry.unit, entry.unit_label || null);
  const [price, setPrice] = useState("");
  const [day, setDay] = useState(today);
  const [error, setError] = useState("");
  const priceOk = isValidUnitPrice(price);
  const save = useMutation({
    mutationFn: () =>
      setMaterialPrice({
        category: entry.category,
        unit_price: price.replace(/,/g, "").trim(),
        effective_from: day,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["material-prices"] });
      void queryClient.invalidateQueries({ queryKey: ["material-price-history", entry.category] });
      // The list's 单价 line and 花费 move with it.
      void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["receipts"] });
      onDone();
    },
    onError: (reason) => {
      if (isSignOffCancelled(reason)) return;
      setError(reason instanceof ApiError ? reason.message : t("failed"));
    },
  });
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">
        {entry.is_spec ? entry.name : t("wholeMaterial", { name: entry.name })}
        {entry.current?.unit_price && (
          <span className="ml-2 font-normal text-muted-foreground">
            {t("nowIs", { price: entry.current.unit_price, unit })}
          </span>
        )}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldWrapper
          label={t("priceLabel", { unit })}
          required
          error={price && !priceOk ? t("priceRule") : undefined}
          hint={t("priceHint")}
        >
          <Input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            aria-label={t("priceLabel", { unit })}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("effectiveFrom")} required hint={t("effectiveHint")}>
          <Input
            type="date"
            aria-label={t("effectiveFrom")}
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </FieldWrapper>
      </div>
      <p className="text-xs text-muted-foreground">{t("keepsOld")}</p>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button
          requires={[
            [priceOk, t("priceLabel", { unit })],
            [Boolean(day), t("effectiveFrom")],
          ]}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {t("save")}
        </Button>
      </DialogFooter>
    </div>
  );
}

function PriceHistory({ entry, onBack }: { entry: MaterialPriceEntry; onBack: () => void }) {
  const t = useTranslations("materialPrices");
  const when = useDateFormat();
  const unitName = useUnitName();
  const history = useQuery({
    queryKey: ["material-price-history", entry.category],
    queryFn: () => getMaterialPriceHistory(entry.category),
  });
  const rows = history.data?.results ?? [];
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">
        {t("historyTitle", { name: entry.is_spec ? entry.name : t("wholeMaterial", { name: entry.name }) })}
      </h3>
      <QueryFailedNote query={history} what={t("history")} />
      {history.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        !history.isError && <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
      ) : (
        <div className="rounded-lg border">
          <Table fit>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{t("col.oldPrice")}</TableHead>
                <TableHead className="text-right">{t("col.newPrice")}</TableHead>
                <TableHead>{t("col.by")}</TableHead>
                <TableHead>{t("col.at")}</TableHead>
                <TableHead>{t("col.from")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const unit = unitName(row.unit, row.unit === entry.unit ? entry.unit_label || null : null);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.previous_price ? t("perUnit", { price: row.previous_price, unit }) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {t("perUnit", { price: row.unit_price, unit })}
                    </TableCell>
                    <TableCell>{row.created_by_name || "—"}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{when.dateTime(row.created_at)}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{when.date(row.effective_from)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          {t("back")}
        </Button>
      </DialogFooter>
    </section>
  );
}

"use client";

/**
 * 【人工单价设定】 (JB295): 「支持按人员、工种及所属公司设定人工单价」.
 *
 * The rates in force, grouped 按人员 / 按所属公司 + 工种 / 按工种 / 按所属公司,
 * one sentence on which one counts, 【新增单价】 (choose 按什么, then who, 日薪
 * or 时薪, 单价, 超时单价, 生效日期, 备注, then the six-digit PIN) and 【价格历史】
 * per row. Rates are the company's, for every project; a change is a new row
 * from its 生效日期 and never changes a confirmed month or a 结算单.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  companyText,
  overtimeText,
  ratePrice,
  todayIso,
  tradeText,
} from "@/components/labour/labour-shared";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDateFormat } from "@/lib/dates";
import {
  getLabourOptions,
  getLabourRateHistory,
  getLabourRates,
  LABOUR_METHODS,
  LABOUR_SCOPES,
  setLabourRate,
  type LabourMethod,
  type LabourOptions,
  type LabourRate,
  type LabourScope,
} from "@/services/labour.service";

/** What 【设定单价】 on a 按月 row fills in for the new rate. */
export interface LabourRatePrefill {
  scope: LabourScope;
  person_key?: string;
  company_key?: string;
  trade?: string;
}

/** The person / company / trade a rate is for, in words. */
export function rateTarget(t: ReturnType<typeof useTranslations>, rate: LabourRate): string {
  if (rate.scope === "PERSON") return rate.person_name || rate.person_key;
  if (rate.scope === "COMPANY_TRADE") {
    return t("rate.companyTrade", { company: companyText(t, rate.company_key, rate.company_name), trade: rate.trade });
  }
  if (rate.scope === "TRADE") return rate.trade;
  return companyText(t, rate.company_key, rate.company_name);
}

/** The rates in force, by scope, in the order they are looked for. */
export function ratesByScope(rows: readonly LabourRate[]): { scope: LabourScope; rows: LabourRate[] }[] {
  return LABOUR_SCOPES.map((scope) => ({ scope, rows: rows.filter((row) => row.scope === scope) }));
}

export function LabourRatesDialog({
  project,
  prefill,
  onClose,
}: {
  project: string;
  prefill?: LabourRatePrefill | null;
  onClose: () => void;
}) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  const rates = useQuery({ queryKey: ["labour", "rates", project], queryFn: () => getLabourRates(project || undefined) });
  const options = useQuery({
    queryKey: ["labour", "options", project],
    queryFn: () => getLabourOptions(project),
    enabled: Boolean(project),
  });
  const [adding, setAdding] = useState<LabourRatePrefill | null>(prefill ?? null);
  const [history, setHistory] = useState<LabourRate | null>(null);
  const groups = ratesByScope(rates.data?.rows ?? []);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="labour-rates-dialog" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{t("rates.title")}</DialogTitle>
          <DialogDescription>{t("rates.help")}</DialogDescription>
        </DialogHeader>
        <p
          className="rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-base leading-7"
          data-slot="labour-rates-order"
        >
          {t("rates.order")}
        </p>
        {adding ? (
          <NewRateForm
            key={JSON.stringify(adding)}
            project={project}
            options={options.data}
            optionsQuery={options}
            prefill={adding}
            onDone={() => setAdding(null)}
          />
        ) : (
          <div className="flex justify-end">
            <Button size="lg" data-slot="labour-rate-add" onClick={() => setAdding({ scope: "PERSON" })}>
              <Plus />
              {t("rates.add")}
            </Button>
          </div>
        )}
        <QueryFailedNote query={rates} what={t("rates.what")} />
        {rates.isLoading ? (
          <div className="grid min-h-24 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : null}
        {rates.data ? (
          <div className="space-y-5" data-slot="labour-rates-list">
            {groups.map((group) => (
              <section key={group.scope} className="space-y-2" data-slot={`labour-rates-${group.scope}`}>
                <h3 className="text-base font-semibold">{t(`scope.${group.scope}`)}</h3>
                {group.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("rates.noneInScope")}</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("rates.col.target")}</TableHead>
                          <TableHead>{t("rates.col.price")}</TableHead>
                          <TableHead>{t("rates.col.overtime")}</TableHead>
                          <TableHead>{t("rates.col.from")}</TableHead>
                          <TableHead>{t("rates.col.note")}</TableHead>
                          <TableHead>{t("rates.col.by")}</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.rows.map((rate) => (
                          <TableRow key={rate.id} data-slot="labour-rate-row">
                            <TableCell className="font-medium">{rateTarget(t, rate)}</TableCell>
                            <TableCell className="whitespace-nowrap">{ratePrice(t, rate.method, rate.unit_price)}</TableCell>
                            <TableCell className="whitespace-nowrap">{overtimeText(t, rate.overtime_rate)}</TableCell>
                            <TableCell className="tabular whitespace-nowrap">{df.date(rate.effective_from)}</TableCell>
                            <TableCell className="max-w-56 whitespace-pre-wrap text-sm">{rate.note || "—"}</TableCell>
                            <TableCell className="text-sm">
                              {rate.created_by_name} · {df.dateTime(rate.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => setHistory(rate)}>
                                <History />
                                {t("rates.history")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : null}
        {history ? <RateHistoryDialog rate={history} onClose={() => setHistory(null)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** 【价格历史】: every rate of one scope and key, newest first. */
function RateHistoryDialog({ rate, onClose }: { rate: LabourRate; onClose: () => void }) {
  const t = useTranslations("jb295");
  const df = useDateFormat();
  const history = useQuery({
    queryKey: ["labour", "rate-history", rate.scope, rate.person_key, rate.company_key, rate.trade],
    queryFn: () => getLabourRateHistory(rate),
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="labour-rate-history" className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("rates.historyTitle", { name: rateTarget(t, rate) })}</DialogTitle>
          <DialogDescription>{t("rates.historyHelp")}</DialogDescription>
        </DialogHeader>
        <QueryFailedNote query={history} what={t("rates.history")} />
        {history.isLoading ? <Loader2 className="mx-auto size-6 animate-spin text-primary" /> : null}
        {history.data ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("rates.col.from")}</TableHead>
                  <TableHead>{t("rates.col.price")}</TableHead>
                  <TableHead>{t("rates.col.overtime")}</TableHead>
                  <TableHead>{t("rates.col.note")}</TableHead>
                  <TableHead>{t("rates.col.by")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.rows.map((row) => (
                  <TableRow key={row.id} data-slot="labour-rate-history-row">
                    <TableCell className="tabular whitespace-nowrap">{df.date(row.effective_from)}</TableCell>
                    <TableCell className="whitespace-nowrap">{ratePrice(t, row.method, row.unit_price)}</TableCell>
                    <TableCell className="whitespace-nowrap">{overtimeText(t, row.overtime_rate)}</TableCell>
                    <TableCell className="whitespace-pre-wrap text-sm">{row.note || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {row.created_by_name} · {df.dateTime(row.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** A money box: more than 0, at most two places. */
export function validPrice(value: string): boolean {
  return /^\d{1,9}(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
}

/** Who the new rate is for: what the chosen 按什么 still needs. */
export function rateTargetMissing(
  scope: LabourScope,
  chosen: { person_key: string; company_key: string; trade: string },
): ("person" | "company" | "trade")[] {
  const missing: ("person" | "company" | "trade")[] = [];
  if (scope === "PERSON" && !chosen.person_key) missing.push("person");
  if ((scope === "COMPANY" || scope === "COMPANY_TRADE") && !chosen.company_key) missing.push("company");
  if ((scope === "TRADE" || scope === "COMPANY_TRADE") && !chosen.trade) missing.push("trade");
  return missing;
}

function NewRateForm({
  project,
  options,
  optionsQuery,
  prefill,
  onDone,
}: {
  project: string;
  options: LabourOptions | undefined;
  optionsQuery: { isError: boolean; refetch?: () => unknown };
  prefill: LabourRatePrefill;
  onDone: () => void;
}) {
  const t = useTranslations("jb295");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<LabourScope>(prefill.scope);
  const [personKey, setPersonKey] = useState(prefill.person_key ?? "");
  const [companyKey, setCompanyKey] = useState(prefill.company_key ?? "");
  const [trade, setTrade] = useState(prefill.trade ?? "");
  const [method, setMethod] = useState<LabourMethod>("DAILY");
  const [unitPrice, setUnitPrice] = useState("");
  const [overtimeRate, setOvertimeRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      setLabourRate({
        scope,
        person_key: personKey,
        company_key: companyKey,
        trade,
        method,
        unit_price: unitPrice,
        overtime_rate: overtimeRate,
        effective_from: effectiveFrom,
        note,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["labour"] });
      onDone();
    },
  });
  const people = options?.people ?? [];
  // 「未填所属公司」 has no rate of its own: such a worker is priced by person or trade.
  const companies = (options?.companies ?? []).filter((company) => company.kind !== "none");
  const trades = options?.trades ?? [];
  const missing = rateTargetMissing(scope, { person_key: personKey, company_key: companyKey, trade });
  const priceOk = validPrice(unitPrice);
  const overtimeOk = !overtimeRate.trim() || validPrice(overtimeRate);
  return (
    <section className="space-y-4 rounded-xl border-2 border-primary/30 p-4" data-slot="labour-rate-form">
      <h3 className="text-lg font-semibold">{t("rates.add")}</h3>
      {!project ? <p className="text-sm text-warning">{t("chooseProjectFirst")}</p> : null}
      <QueryFailedNote query={optionsQuery} what={t("rates.whatOptions")} />
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("rates.chooseScope")}</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label={t("rates.chooseScope")}>
          {LABOUR_SCOPES.map((each) => (
            <Button
              key={each}
              type="button"
              role="radio"
              aria-checked={scope === each}
              variant={scope === each ? "default" : "outline"}
              className="h-auto min-h-16 flex-col items-start gap-1 whitespace-normal px-4 py-3 text-left"
              data-slot={`labour-scope-${each}`}
              onClick={() => setScope(each)}
            >
              <span className="text-base font-semibold">{t(`scope.${each}`)}</span>
              <span className="text-xs font-normal opacity-90">{t(`scopeHelp.${each}`)}</span>
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {scope === "PERSON" ? (
          <FieldWrapper label={t("field.person")} required className="sm:col-span-2">
            <Select value={personKey || undefined} onValueChange={setPersonKey}>
              <SelectTrigger aria-label={t("field.person")} className="h-11 text-base">
                <SelectValue placeholder={t("choosePerson")} />
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.key} value={person.key}>
                    {t("personOption", {
                      name: person.name,
                      group: t(`group.${person.group}`),
                      company: companyText(t, person.company_key, person.company_name),
                      trade: tradeText(t, person.trade_name),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        ) : null}
        {scope === "COMPANY" || scope === "COMPANY_TRADE" ? (
          <FieldWrapper label={t("field.company")} required>
            <Select value={companyKey || undefined} onValueChange={setCompanyKey}>
              <SelectTrigger aria-label={t("field.company")} className="h-11 text-base">
                <SelectValue placeholder={t("chooseCompany")} />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.key} value={company.key}>
                    {companyText(t, company.key, company.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        ) : null}
        {scope === "TRADE" || scope === "COMPANY_TRADE" ? (
          <FieldWrapper label={t("field.trade")} required>
            <Select value={trade || undefined} onValueChange={setTrade}>
              <SelectTrigger aria-label={t("field.trade")} className="h-11 text-base">
                <SelectValue placeholder={t("chooseTrade")} />
              </SelectTrigger>
              <SelectContent>
                {trades.map((each) => (
                  <SelectItem key={each.key} value={each.name}>
                    {each.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        ) : null}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("field.method")}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("field.method")}>
          {LABOUR_METHODS.map((each) => (
            <Button
              key={each}
              type="button"
              role="radio"
              aria-checked={method === each}
              variant={method === each ? "default" : "outline"}
              className="h-12 min-w-32 text-base"
              data-slot={`labour-method-${each}`}
              onClick={() => setMethod(each)}
            >
              {t(`method.${each}`)}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{t(`methodHelp.${method}`)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FieldWrapper
          label={method === "DAILY" ? t("field.dayPrice") : t("field.hourPrice")}
          required
          error={unitPrice && !priceOk ? t("field.priceInvalid") : undefined}
        >
          <Input
            inputMode="decimal"
            className="h-11 text-base"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper
          label={t("field.overtimeRate")}
          optional={common("optional")}
          hint={t("field.overtimeHint")}
          error={!overtimeOk ? t("field.priceInvalid") : undefined}
        >
          <Input
            inputMode="decimal"
            className="h-11 text-base"
            value={overtimeRate}
            onChange={(event) => setOvertimeRate(event.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.effectiveFrom")} required hint={t("field.effectiveHint")}>
          <Input
            type="date"
            className="h-11 text-base"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </FieldWrapper>
      </div>
      <FieldWrapper label={t("field.note")} optional={common("optional")}>
        <Textarea value={note} rows={2} maxLength={500} onChange={(event) => setNote(event.target.value)} />
      </FieldWrapper>
      <p className="text-sm text-muted-foreground">{t("rates.pinNote")}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="lg" onClick={onDone} disabled={save.isPending}>
          {common("cancel")}
        </Button>
        <Button
          size="lg"
          data-slot="labour-rate-save"
          requires={[
            [!missing.includes("person"), t("field.person")],
            [!missing.includes("company"), t("field.company")],
            [!missing.includes("trade"), t("field.trade")],
            [priceOk, method === "DAILY" ? t("field.dayPrice") : t("field.hourPrice")],
            [overtimeOk, t("field.overtimeRate")],
            [effectiveFrom, t("field.effectiveFrom")],
          ]}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {t("rates.save")}
        </Button>
      </div>
    </section>
  );
}

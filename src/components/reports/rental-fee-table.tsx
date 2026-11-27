"use client";

/**
 * 设备租赁费用报表's machine table (JB257, 客户 11-24b 事项 4): 「关联设备租赁
 * 条件、进退场日期、累计在场天数、正常工时、超时工时及实际租赁费用……系统自动统计
 * 每台设备的租赁费用及累计总金额」.
 *
 * The server works every amount out with the 按月 page's own function
 * (`site_operations/equipment_rental.py`); this only shows it. The in / out
 * records stay the report's preview rows under it.
 */

import { useTranslations } from "next-intl";

import { RentalTermsLines, rentalMoney } from "@/components/equipment-hours/rental-fees";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RentalReport, RentalReportRow } from "@/interfaces/contractor-report";
import type { RentalTermsValues } from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";

/** The amounts, in the 按月 page's order. */
const FEES = ["base_rent", "overtime_fee", "diesel_fee", "adjustment_amount", "rental_total"] as const;

type Translate = ReturnType<typeof useTranslations>;

/**
 * The words the exported file prints the machine table in (`rental_labels`):
 * the same headings and the same terms line as the screen.
 */
export function rentalLabels(t: Translate, tRental: Translate) {
  return {
    title: t("title"),
    total: t("total"),
    equipment: t("column.equipment"),
    supplier_name: t("column.supplier"),
    rental_terms_text: t("column.terms"),
    entry_date: t("column.entry"),
    exit_date: t("column.exit"),
    days_on_site: t("column.daysOnSite"),
    days_worked: t("column.daysWorked"),
    normal_hours: t("column.normalHours"),
    overtime_hours: t("column.overtimeHours"),
    ...Object.fromEntries(FEES.map((key) => [key, tRental(`fee.${key}`)])),
    no_terms: tRental("noTermsShort"),
    methods: Object.fromEntries(
      (["HOURLY", "DAILY", "MONTHLY", "YEARLY", "FIXED"] as const).map((method) => [method, tRental(`method.${method}`)]),
    ),
    diesel: Object.fromEntries(
      (["INCLUDED", "CONTRACTOR", "SUPPLIER_CHARGED"] as const).map((supply) => [supply, tRental(`diesel.${supply}`)]),
    ),
    overtime: tRental("summary.overtime"),
  };
}

function hasTerms(row: RentalReportRow): row is RentalReportRow & { rental_terms: RentalTermsValues } {
  return Boolean(row.rental_terms && "method" in row.rental_terms && row.rental_terms.method);
}

export function RentalFeeTable({ rental }: { rental: RentalReport }) {
  const t = useTranslations("jb257");
  const tRental = useTranslations("equipmentRental");
  const df = useDateFormat();
  return (
    <section className="surface-panel overflow-hidden rounded-xl" data-slot="rental-fees">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-panel-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 className="panel-title">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("help")}</p>
        </div>
        <p className="text-right">
          <span className="block text-xs text-muted-foreground">{t("total")}</span>
          <span className="tabular text-lg font-semibold" data-slot="rental-grand-total">
            RM {rentalMoney(rental.totals.rental_total)}
          </span>
        </p>
      </div>
      {rental.rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table fit containerClassName="max-h-[60dvh]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("column.equipment")}</TableHead>
              <TableHead>{t("column.supplier")}</TableHead>
              <TableHead>{t("column.terms")}</TableHead>
              <TableHead>{t("column.entry")}</TableHead>
              <TableHead>{t("column.exit")}</TableHead>
              <TableHead className="tabular text-right">{t("column.daysOnSite")}</TableHead>
              <TableHead className="tabular text-right">{t("column.daysWorked")}</TableHead>
              <TableHead className="tabular text-right">{t("column.normalHours")}</TableHead>
              <TableHead className="tabular text-right">{t("column.overtimeHours")}</TableHead>
              {FEES.map((key) => (
                <TableHead key={key} className="tabular text-right">
                  {tRental(`fee.${key}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rental.rows.map((row) => (
              <TableRow key={row.equipment_id}>
                <TableCell className="align-top font-medium">{row.equipment}</TableCell>
                <TableCell className="align-top">{row.supplier_name || "-"}</TableCell>
                <TableCell className="align-top text-xs leading-5">
                  {hasTerms(row) ? <RentalTermsLines terms={row.rental_terms} /> : (
                    <span className="font-medium text-warning">{tRental("noTermsShort")}</span>
                  )}
                  {row.confirmed_months.length > 0 ? (
                    <span className="block text-muted-foreground">
                      {t("confirmedMonths", { months: row.confirmed_months.join("、") })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">{row.entry_date ? df.date(row.entry_date) : "-"}</TableCell>
                <TableCell className="align-top">
                  {row.exit_date ? df.date(row.exit_date) : row.entry_date ? t("onSite") : "-"}
                </TableCell>
                <TableCell className="tabular text-right align-top">{row.days_on_site ?? "-"}</TableCell>
                <TableCell className="tabular text-right align-top">{row.days_worked}</TableCell>
                <TableCell className="tabular text-right align-top">{row.normal_hours}</TableCell>
                <TableCell className="tabular text-right align-top">{row.overtime_hours}</TableCell>
                {FEES.map((key) => (
                  <TableCell
                    key={key}
                    className={key === "rental_total" ? "tabular text-right align-top font-semibold" : "tabular text-right align-top"}
                  >
                    {rentalMoney(row[key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">{t("total")}</TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell className="text-right" />
              <TableCell className="tabular text-right font-semibold">{rental.totals.days_worked}</TableCell>
              <TableCell className="tabular text-right font-semibold">{rental.totals.normal_hours}</TableCell>
              <TableCell className="tabular text-right font-semibold">{rental.totals.overtime_hours}</TableCell>
              {FEES.map((key) => (
                <TableCell key={key} className="tabular text-right font-semibold">
                  {rentalMoney(rental.totals[key])}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      )}
    </section>
  );
}

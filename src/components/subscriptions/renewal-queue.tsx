"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { SubscriptionActionDialog } from "@/components/subscriptions/subscription-action-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompanySubscription } from "@/interfaces/subscription";
import { useDateFormat } from "@/lib/dates";
import {
  getExpiringSubscriptions,
  getSubscriptionPlans,
} from "@/services/subscription.service";

export function RenewalQueue() {
  const t = useTranslations("subscriptions");
  const common = useTranslations("common");
  const df = useDateFormat();
  const { can } = useAuth();
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState<CompanySubscription | null>(null);

  const queue = useQuery({
    queryKey: ["subscriptions", "expiring", days],
    queryFn: () => getExpiringSubscriptions(days),
  });
  const plans = useQuery({
    queryKey: ["subscription-plans", "options"],
    queryFn: () => getSubscriptionPlans({ page_size: 100, sort_by: "sort_order" }),
  });

  const rows = queue.data?.results ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("renewals.count", { count: queue.data?.count ?? 0 })}
        </p>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {[7, 30, 60, 90].map((value) => (
            <option key={value} value={value}>{t("renewals.window", { count: value })}</option>
          ))}
        </select>
      </div>

      <div className="min-h-0 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>{t("field.company")}</TableHead>
              <TableHead>{t("field.audience")}</TableHead>
              <TableHead>{t("field.plan")}</TableHead>
              <TableHead>{t("field.expiresOn")}</TableHead>
              <TableHead>{t("field.state")}</TableHead>
              <TableHead>{t("field.seats")}</TableHead>
              <TableHead className="w-12"><span className="sr-only">{common("actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.isLoading ? (
              <TableRow><TableCell colSpan={7}>{common("loading")}</TableCell></TableRow>
            ) : queue.isError ? (
              <TableRow><TableCell colSpan={7} className="text-destructive">{t("error.load")}</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">{t("renewals.empty")}</TableCell></TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell><p className="font-medium">{row.company_name}</p><p className="text-xs text-muted-foreground">{row.company_code}</p></TableCell>
                <TableCell><TypeBadge label={t(`audience.${row.company_type}`)} /></TableCell>
                <TableCell>{row.plan_name ?? common("emptyValue")}</TableCell>
                <TableCell className="tabular-nums"><p>{row.subscription_expires_on ? df.date(row.subscription_expires_on) : common("emptyValue")}</p><p className="text-xs text-muted-foreground">{row.days_to_expiry === null ? common("emptyValue") : t("daysRemaining", { count: row.days_to_expiry })}</p></TableCell>
                <TableCell><StatusBadge label={t(`state.${row.subscription_state}`)} tone={row.subscription_state === "EXPIRED" ? "danger" : "warning"} /></TableCell>
                <TableCell className="tabular-nums">{t("seatUsage", { used: row.used_user_seats, limit: row.user_limit ?? t("value.unlimited") })}</TableCell>
                <TableCell>
                  {can("subscription.manage") && row.plan && (
                    <Button variant="ghost" size="icon" title={t("action.extend.menu")} onClick={() => setSelected(row)}><CalendarPlus className="h-4 w-4" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <SubscriptionActionDialog
        key={selected?.id ?? "none"}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        mode="extend"
        subscription={selected}
        plans={plans.data?.results ?? []}
      />
    </div>
  );
}

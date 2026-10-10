"use client";

/**
 * 指定厂商（MR） (2026-10-10): there is no manufacturer list to keep any more.
 *
 * The client, on 「全部厂商」: 「这个厂商也是同样是供应商，只是在MR 业主要求著名
 * 订购厂」 - a manufacturer is a company on the supplier list, and it only
 * matters when the owner names one in a material request. Every picker now
 * offers the supplier list, so this page (reachable from old bookmarks; it is
 * no longer in the menu) says so, sends the office to 供应商, and shows what
 * the old list held and which supplier each entry became - read-only, so
 * nothing the office typed is lost from sight.
 */

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFormerManufacturers } from "@/services/material-setup.service";

export function Manufacturers() {
  const t = useTranslations("manufacturers");
  const { can } = useAuth();
  const canSeeSuppliers = can("supplier.view");
  const former = useQuery({
    queryKey: ["manufacturers", "former"],
    queryFn: getFormerManufacturers,
    enabled: canSeeSuppliers,
  });
  const rows = former.data ?? [];

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("title")}
        subtitle={t("description")}
        action={
          canSeeSuppliers ? (
            <Button asChild>
              <Link href="/suppliers">
                {t("goToSuppliers")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div
        role="note"
        className="flex items-start gap-3 rounded-xl border border-panel-border bg-card px-4 py-3 text-sm"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p className="leading-6">{t("note")}</p>
      </div>
      {canSeeSuppliers && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t("former.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("former.description")}</p>
          <QueryFailedNote query={former} what={t("former.title")} />
          {former.isSuccess && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("former.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-panel-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("former.name")}</TableHead>
                    <TableHead>{t("former.country")}</TableHead>
                    <TableHead>{t("former.supplier")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {row.name}
                          {!row.is_active && <StatusBadge label={t("former.switchedOff")} tone="neutral" />}
                        </span>
                      </TableCell>
                      <TableCell>{row.country || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {row.supplier_name ? (
                          <span>
                            {row.supplier_name}
                            {row.supplier_code && (
                              <span className="ml-1 text-xs text-muted-foreground">{row.supplier_code}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

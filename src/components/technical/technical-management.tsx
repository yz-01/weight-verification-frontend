"use client";

/**
 * 技术管理: photo uploads and original backups, for the people who look after
 * the phones (Lucas, 2026-10-09: 「原图同步、重试及储存管理放在技术管理页面，
 * 不显示给现场人员」).
 *
 * Two halves, and the page says which is which:
 *
 * - the server's view, for the whole company: whose phone still owes how many
 *   originals, how many failed and when (`get_backup_overview`);
 * - this device's view: the records and originals waiting on the device the
 *   page is open on, with retry, the armed discard and the cache cleanup
 *   (`DeviceUploadTools`). Those bytes live only on the phone that took them.
 *
 * Under 公司设置 in the office menu, behind `company_settings.manage`; site
 * staff never see it. A technician reaches the device half on a worker's
 * phone through the unlisted `/field-staff/device`.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { ListHeader, QueryFailedNote } from "@/components/shared/page-primitives";
import { DeviceUploadTools } from "@/components/technical/device-upload-tools";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDateFormat } from "@/lib/dates";
import { megabytes } from "@/lib/original-photos";
import { getOriginalBackupOverview } from "@/services/evidence.service";

export function TechnicalManagement() {
  const t = useTranslations("technical");
  return (
    <div className="space-y-6">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      <ServerOriginals />
      <section className="space-y-3">
        <h2 className="panel-title">{t("device.title")}</h2>
        <DeviceUploadTools />
      </section>
    </div>
  );
}

const COLUMNS = ["person", "pending", "failed", "backedUp", "owed", "oldest", "lastError"] as const;

/** The company's originals, per person, as the server holds them. */
function ServerOriginals() {
  const t = useTranslations("technical.server");
  const df = useDateFormat();
  const overview = useQuery({
    queryKey: ["evidence-originals", "overview"],
    queryFn: getOriginalBackupOverview,
  });
  const totals = overview.data?.totals;
  const people = overview.data?.people ?? [];

  return (
    <section className="surface-panel space-y-3 rounded-xl p-4" data-server-originals>
      <div>
        <h2 className="panel-title">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("help")}</p>
      </div>
      <QueryFailedNote query={overview} what={t("what")} />
      {totals && (
        <p className="text-sm">
          {t("totals", {
            pending: totals.pending,
            failed: totals.failed,
            backedUp: totals.backed_up,
            mb: megabytes(totals.owed_bytes),
          })}
        </p>
      )}
      {overview.isLoading ? null : people.length === 0 ? (
        !overview.isError && (
          <p className="rounded-xl border border-dashed border-panel-border p-4 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((key) => (
                  <TableHead key={key}>{t(`column.${key}`)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => (
                <TableRow key={person.user_id ?? "unknown"}>
                  <TableCell>
                    <span className="font-medium">{person.name || t("unknownPerson")}</span>
                    {person.email && (
                      <span className="block text-xs text-muted-foreground">{person.email}</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular">{person.pending}</TableCell>
                  <TableCell className={`tabular ${person.failed ? "font-medium text-destructive" : ""}`}>
                    {person.failed}
                  </TableCell>
                  <TableCell className="tabular">{person.backed_up}</TableCell>
                  <TableCell className="tabular whitespace-nowrap">
                    {person.owed_bytes ? `${megabytes(person.owed_bytes)} MB` : "—"}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap">
                    {person.oldest_owed_at ? df.dateTime(person.oldest_owed_at) : "—"}
                  </TableCell>
                  <TableCell className="max-w-56 text-xs text-muted-foreground">
                    {person.last_error
                      ? `${t(person.last_error === "hash_mismatch" ? "error.hashMismatch" : "error.other")}${
                          person.last_failed_at ? ` · ${df.dateTime(person.last_failed_at)}` : ""
                        }`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

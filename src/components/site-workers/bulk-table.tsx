"use client";

/**
 * 批量新增人员's table (JB61-1): one row a person, typed like Excel.
 *
 * Tab moves right, Enter moves down, Shift goes back; pasting a block copied
 * from Excel or WhatsApp fills the rows from the box it lands in. A row with a
 * problem is red and says why on a line under it; a passport photo that was
 * not read with every check digit right is yellow, with the photo beside it
 * and 「对着照片补打」.
 */

import { FileText, Trash2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BatchRowProblem } from "@/interfaces/site-workers";
import {
  BULK_FIELDS,
  applyPaste,
  editRow,
  isGridPaste,
  nextCell,
  parsePaste,
  type BulkField,
  type BulkRow,
} from "@/lib/site-workers-bulk";
import { cn } from "@/lib/utils";

const FIELD_LABEL: Record<BulkField, string> = {
  name: "field.name",
  phone: "field.phone",
  passport_no: "field.passportNo",
  nationality: "field.nationality",
  date_of_birth: "field.dateOfBirth",
  passport_expiry: "field.passportExpiry",
  cidb_no: "field.cidb",
  company_text: "field.company",
  trade_text: "field.trade",
};

/**
 * Each box's least width, from the longest value it is meant to hold at 14 px
 * (10-28 retake at 1440 px with the menu open: 「+60 11-2390 5」, 「Banglad」,
 * 「15/03/199…」, 「CIDB-830…」, 「KJ Formwork E…」). On the box, not the
 * header: a fitted table (`data-fit`) lets a header shrink to nothing, never
 * a cell's content. The name, the country and the company wrap onto a second
 * line rather than widen the table; a phone number, a passport number, a date
 * and a CIDB number are always whole on one line. Together they fit 1440 px
 * with the menu open; on a narrower screen the table scrolls sideways inside
 * its box with the name kept at the left and the bin at the right.
 */
export const FIELD_WIDTH: Record<BulkField, string> = {
  name: "min-w-36",
  phone: "min-w-34",
  passport_no: "min-w-26",
  nationality: "min-w-22",
  date_of_birth: "min-w-22",
  passport_expiry: "min-w-22",
  cidb_no: "min-w-30",
  company_text: "min-w-28",
  // 「混凝土工」 whole; a longer trade wraps.
  trade_text: "min-w-20",
};

/** Boxes that wrap their words onto a second line instead of being cut. */
export const WRAPS: ReadonlySet<BulkField> = new Set(["name", "nationality", "company_text", "trade_text"]);

/** Kept at the left while the row scrolls sideways (opaque, above the rest). */
const STICKY_LEFT = "sticky left-0 z-[2] bg-card shadow-[inset_-1px_0_0_var(--panel-border)]";

export interface CellFocus {
  row: number;
  column: number;
}

export function BulkTable({
  rows,
  shown,
  problems,
  fills = {},
  companyPlaceholder,
  focus,
  onRows,
  onFocusDone,
  onNeedMoreRows,
  onMoveTo,
  onRemove,
  onCheck,
}: {
  /** Every row of the batch. */
  rows: BulkRow[];
  /** The indexes into `rows` this page shows. */
  shown: number[];
  problems: Record<string, BatchRowProblem[]>;
  /** JB91: rows that only give a worker already on the roster a trade, and whose. */
  fills?: Record<string, { name: string }>;
  /** The batch's company, shown in an empty 公司 box. */
  companyPlaceholder: string;
  /** A cell to put the cursor in once it is drawn. */
  focus: CellFocus | null;
  onRows: (rows: BulkRow[]) => void;
  onFocusDone: () => void;
  /** Tab or Enter past the last row: 「再加 20 行」 and carry on. */
  onNeedMoreRows: (from: CellFocus) => void;
  /** A cell on another page of the table. */
  onMoveTo: (cell: CellFocus) => void;
  onRemove: (index: number) => void;
  /** 「对着照片补打」 on this row. */
  onCheck: (index: number) => void;
}) {
  const t = useTranslations("siteWorkers");
  const bulk = useTranslations("siteWorkers.bulk");
  const body = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    if (!focus) return;
    const cell = body.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[data-cell="${focus.row}-${focus.column}"]`,
    );
    if (cell) {
      cell.focus();
      cell.select();
      onFocusDone();
    }
  }, [focus, onFocusDone, shown]);

  const move = (index: number, column: number, key: "Tab" | "Enter", shift: boolean) => {
    const target = nextCell(index, column, key, shift, rows.length);
    if (!target) {
      onNeedMoreRows({ row: index, column: key === "Tab" ? 0 : column });
      return;
    }
    const input = body.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-cell="${target.row}-${target.column}"]`);
    if (input) {
      input.focus();
      input.select();
    } else {
      onMoveTo(target);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {/* 行 and 姓名 in one column, kept at the left. */}
          <TableHead className={cn(STICKY_LEFT, "z-[12]")}>
            <span className="mr-2 inline-block w-6 text-right">{bulk("column.number")}</span>
            {t(FIELD_LABEL.name)}
          </TableHead>
          <TableHead>{bulk("column.photo")}</TableHead>
          {BULK_FIELDS.filter((field) => field !== "name").map((field) => (
            <TableHead key={field}>{t(FIELD_LABEL[field])}</TableHead>
          ))}
          <TableHead pin="end">
            <span className="sr-only">{bulk("removeRow")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody ref={body}>
        {shown.map((index) => {
          const row = rows[index];
          const found = row.id ? (problems[row.id] ?? []) : [];
          const red = found.some((problem) => problem.code !== "check_photo");
          const tone = red ? "bg-destructive/5" : row.needsCheck ? "bg-warning/10" : undefined;
          // The kept-left cell is opaque, so it carries the row's tint itself.
          const stickyTone = red
            ? "bg-[color-mix(in_oklab,var(--destructive)_5%,var(--card))]"
            : row.needsCheck
              ? "bg-[color-mix(in_oklab,var(--warning)_10%,var(--card))]"
              : undefined;
          const fill = row.id && found.length === 0 ? fills[row.id] : undefined;
          const explained = found.length > 0 || row.needsCheck || Boolean(fill);
          return (
            <Fragment key={row.key}>
            <TableRow className={cn(tone, explained && "border-b-0")}>
              {BULK_FIELDS.map((field, column) => {
                const box = {
                  "data-cell": `${index}-${column}`,
                  "aria-label": `${t(FIELD_LABEL[field])} ${index + 1}`,
                  // The whole value on hover too.
                  title: row.values[field] || undefined,
                  value: row.values[field],
                  placeholder:
                    field === "company_text"
                      ? companyPlaceholder
                      : field === "date_of_birth" || field === "passport_expiry"
                        ? bulk("datePlaceholder")
                        : undefined,
                  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                    const next = rows.slice();
                    next[index] = editRow(row, field, event.target.value);
                    onRows(next);
                  },
                  onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                    if (event.key !== "Tab" && event.key !== "Enter") return;
                    event.preventDefault();
                    move(index, column, event.key, event.shiftKey);
                  },
                  onPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                    const text = event.clipboardData.getData("text/plain");
                    if (!isGridPaste(text)) return;
                    event.preventDefault();
                    onRows(applyPaste(rows, index, field, parsePaste(text)));
                  },
                };
                const input = WRAPS.has(field) ? (
                  // Wraps onto a second line rather than being cut off;
                  // Enter still moves down, it never breaks a line.
                  <Textarea
                    {...box}
                    rows={1}
                    className={cn(
                      "min-h-8 resize-none px-1.5 py-1.5 leading-5 break-words",
                      FIELD_WIDTH[field],
                    )}
                  />
                ) : (
                  <Input
                    {...box}
                    className={cn("h-8 px-1.5 tabular-nums", FIELD_WIDTH[field])}
                  />
                );
                if (field === "name") {
                  return (
                    <Fragment key={field}>
                      <TableCell className={cn(STICKY_LEFT, stickyTone, "align-top")}>
                        <div className="flex items-start gap-2">
                          <span className="tabular mt-2 w-6 shrink-0 text-right text-muted-foreground">
                            {index + 1}
                          </span>
                          {input}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {/* The passport, small: the row stays one line high. */}
                        <RowPhoto row={row} label={bulk("column.photo")} onOpen={() => onCheck(index)} />
                      </TableCell>
                    </Fragment>
                  );
                }
                return (
                  <TableCell key={field} className="align-top">
                    {input}
                  </TableCell>
                );
              })}
              <TableCell pin="end" className="align-top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={bulk("removeRow")}
                  title={bulk("removeRow")}
                  onClick={() => onRemove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
            {explained && (
              // Why the row is red or yellow, and 「对着照片补打」, on a line
              // of its own under it (10-28): the row itself stays compact.
              <TableRow className={tone}>
                <TableCell colSpan={BULK_FIELDS.length + 2} className="pb-2 pt-0 text-sm">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-8">
                    {fill && <span className="text-primary">{bulk("fillsTrade", { name: fill.name })}</span>}
                    {found.length > 0 && (
                      <span className="font-medium text-muted-foreground">{bulk("column.problems")}</span>
                    )}
                    {found.length > 0 && (
                      <ul className="inline">
                        {found.map((problem) => (
                          <li
                            key={problem.code}
                            className={cn(
                              "inline after:mx-1.5 after:text-muted-foreground after:content-['·'] last:after:content-none",
                              problem.code === "check_photo" ? "text-warning" : "text-destructive",
                            )}
                          >
                            {bulk(`problem.${problem.code}`, problem.values)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.needsCheck && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onCheck(index)}
                      >
                        {bulk("typeFromPhoto")}
                      </Button>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The passport beside its row: a 40 px thumbnail (it opens large), or a PDF tile. */
function RowPhoto({ row, label, onOpen }: { row: BulkRow; label: string; onOpen: () => void }) {
  if (!row.photoUrl) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="relative block size-10 overflow-hidden rounded-md border bg-muted"
    >
      {row.photoIsPdf ? (
        <span className="flex size-full items-center justify-center">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </span>
      ) : (
        <Image src={row.photoUrl} alt={label} fill sizes="40px" className="object-cover" unoptimized />
      )}
    </button>
  );
}

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
};

/**
 * Each box's least width (10-28: at 1440 px with the menu open the names were
 * cut off). On the box, not the header: a fitted table (`data-fit`) lets a
 * header shrink to nothing, but never a cell's content. 姓名 and 护照号码 come
 * first: the name wraps onto a second line instead of being cut, the passport
 * number is always whole; the rest are as narrow as what they hold. The table
 * scrolls sideways only when even these do not fit.
 */
export const FIELD_WIDTH: Record<BulkField, string> = {
  name: "min-w-40",
  phone: "min-w-28",
  passport_no: "min-w-28",
  nationality: "min-w-16",
  date_of_birth: "min-w-22",
  passport_expiry: "min-w-22",
  cidb_no: "min-w-20",
  company_text: "min-w-28",
};

export interface CellFocus {
  row: number;
  column: number;
}

export function BulkTable({
  rows,
  shown,
  problems,
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
          <TableHead className="w-12">{bulk("column.number")}</TableHead>
          <TableHead className="w-20">{bulk("column.photo")}</TableHead>
          {BULK_FIELDS.map((field) => (
            <TableHead key={field}>{t(FIELD_LABEL[field])}</TableHead>
          ))}
          <TableHead className="w-12">
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
          return (
            <Fragment key={row.key}>
            <TableRow className={cn(tone, found.length > 0 && "border-b-0")}>
              <TableCell className="tabular text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                <RowPhoto row={row} label={bulk("column.photo")} onOpen={() => onCheck(index)} />
                {row.needsCheck && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-1 h-7 px-2 text-xs"
                    onClick={() => onCheck(index)}
                  >
                    {bulk("typeFromPhoto")}
                  </Button>
                )}
              </TableCell>
              {BULK_FIELDS.map((field, column) => {
                const box = {
                  "data-cell": `${index}-${column}`,
                  "aria-label": `${t(FIELD_LABEL[field])} ${index + 1}`,
                  // The whole value on hover, however narrow the box.
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
                return (
                  <TableCell key={field} className="p-1 align-top">
                    {field === "name" ? (
                      // A long name wraps onto a second line rather than being
                      // cut off; Enter still moves down, it never breaks a line.
                      <Textarea
                        {...box}
                        rows={1}
                        className={cn("min-h-8 resize-none px-2 py-1.5 leading-5 break-words", FIELD_WIDTH[field])}
                      />
                    ) : (
                      <Input {...box} className={cn("h-8 px-2", FIELD_WIDTH[field])} />
                    )}
                  </TableCell>
                );
              })}
              <TableCell>
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
            {found.length > 0 && (
              // Why the row is red or yellow, on a line of its own under it
              // (10-28): a narrow last column squeezed the names.
              <TableRow className={tone}>
                <TableCell />
                <TableCell colSpan={BULK_FIELDS.length + 2} className="pb-2 pt-0 text-sm">
                  <span className="mr-2 font-medium text-muted-foreground">{bulk("column.problems")}</span>
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

/** The passport beside its row: a 64 px thumbnail, or a PDF tile. */
function RowPhoto({ row, label, onOpen }: { row: BulkRow; label: string; onOpen: () => void }) {
  if (!row.photoUrl) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="relative block size-16 overflow-hidden rounded-md border bg-muted"
    >
      {row.photoIsPdf ? (
        <span className="flex size-full items-center justify-center">
          <FileText className="h-6 w-6 text-muted-foreground" />
        </span>
      ) : (
        <Image src={row.photoUrl} alt={label} fill sizes="64px" className="object-cover" unoptimized />
      )}
    </button>
  );
}

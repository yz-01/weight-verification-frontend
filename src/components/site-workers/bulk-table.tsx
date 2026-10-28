"use client";

/**
 * 批量新增人员's table (JB61-1): one row a person, typed like Excel.
 *
 * Tab moves right, Enter moves down, Shift goes back; pasting a block copied
 * from Excel or WhatsApp fills the rows from the box it lands in. A row with a
 * problem is red and says why in the last column; a passport photo that was
 * not read with every check digit right is yellow, with the photo beside it
 * and 「对着照片补打」.
 */

import { FileText, Trash2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const FIELD_WIDTH: Record<BulkField, string> = {
  name: "min-w-48",
  phone: "min-w-32",
  passport_no: "min-w-32",
  nationality: "min-w-20",
  date_of_birth: "min-w-28",
  passport_expiry: "min-w-28",
  cidb_no: "min-w-28",
  company_text: "min-w-40",
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
    const cell = body.current?.querySelector<HTMLInputElement>(
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
    const input = body.current?.querySelector<HTMLInputElement>(`[data-cell="${target.row}-${target.column}"]`);
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
            <TableHead key={field} className={FIELD_WIDTH[field]}>
              {t(FIELD_LABEL[field])}
            </TableHead>
          ))}
          <TableHead className="min-w-56">{bulk("column.problems")}</TableHead>
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
          return (
            <TableRow
              key={row.key}
              className={cn(red ? "bg-destructive/5" : row.needsCheck ? "bg-warning/10" : undefined)}
            >
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
              {BULK_FIELDS.map((field, column) => (
                <TableCell key={field} className="p-1">
                  <Input
                    data-cell={`${index}-${column}`}
                    aria-label={`${t(FIELD_LABEL[field])} ${index + 1}`}
                    value={row.values[field]}
                    placeholder={
                      field === "company_text"
                        ? companyPlaceholder
                        : field === "date_of_birth" || field === "passport_expiry"
                          ? bulk("datePlaceholder")
                          : undefined
                    }
                    className="h-8 px-2"
                    onChange={(event) => {
                      const next = rows.slice();
                      next[index] = editRow(row, field, event.target.value);
                      onRows(next);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Tab" && event.key !== "Enter") return;
                      event.preventDefault();
                      move(index, column, event.key, event.shiftKey);
                    }}
                    onPaste={(event) => {
                      const text = event.clipboardData.getData("text/plain");
                      if (!isGridPaste(text)) return;
                      event.preventDefault();
                      onRows(applyPaste(rows, index, field, parsePaste(text)));
                    }}
                  />
                </TableCell>
              ))}
              <TableCell className="text-xs">
                {found.length > 0 && (
                  <ul className="space-y-0.5">
                    {found.map((problem) => (
                      <li
                        key={problem.code}
                        className={problem.code === "check_photo" ? "text-warning" : "text-destructive"}
                      >
                        {bulk(`problem.${problem.code}`, problem.values)}
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
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

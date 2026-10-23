"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { clippedText } from "@/lib/table-fit"
import { cn } from "@/lib/utils"

/**
 * Every table scrolls inside its own box, both ways, and the box is never
 * taller than the screen (IB3, ID22: 「表头不动…要改的话就全部一起改」).
 *
 * The header is `sticky top-0`, and sticky holds against the nearest
 * scrolling ancestor. That used to be this container - `overflow-x-auto`,
 * which makes it a scroll box on both axes - but it never scrolled up and
 * down, because it grew with its rows; the page scrolled instead and the
 * header went with it. Now the container itself is capped to the viewport
 * (`--table-max-h`, globals.css) and scrolls vertically, so the header stays
 * on top of every list on the desktop and on the phone. Printing lets it run
 * to its full length again.
 */
function Table({
  className,
  containerClassName,
  fit = true,
  ...props
}: React.ComponentProps<"table"> & {
  containerClassName?: string
  /**
   * Fit the screen (I39, ID80): columns sized by their content, long text on
   * two lines at most, 13 px, tight padding. The rules are in globals.css
   * under `[data-fit]`; the phone is unchanged. On by default since Lucas
   * 2026-10-24: 「尽量把整个的table的水平滚动条移除掉…整个系统都是这样」.
   * `fit={false}` only for a table that is meant to be read sideways.
   */
  fit?: boolean
}) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "relative min-w-0 max-w-full overflow-auto overscroll-contain [container-type:inline-size] print:max-h-none print:overflow-visible",
        containerClassName,
      )}
    >
      <table
        data-slot="table"
        data-fit={fit ? "" : undefined}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        // Opaque under the tint, so rows scrolling beneath the sticky header
        // do not show through it.
        "sticky top-0 z-10 bg-card text-muted-foreground [&_tr]:border-b [&_tr]:border-panel-border [&_tr]:bg-muted/60",
        className,
      )}
      {...props}
    />
  )
}

function TableBody({ className, children, ...props }: React.ComponentProps<"tbody">) {
  const t = useTranslations("table")
  const hasRows = React.Children.toArray(children).length > 0

  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    >
      {hasRows ? children : (
        <tr className="hover:bg-transparent">
          <td
            colSpan={100}
            className="h-36 p-0 text-center text-sm text-muted-foreground"
          >
            <div className="sticky left-0 flex w-[100cqw] sm:w-full items-center justify-center px-6 whitespace-normal">
              {t("noResults")}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-panel-border bg-muted/60 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors hover:bg-primary/5 has-aria-expanded:bg-primary/5 data-[state=selected]:bg-primary/10",
        className
      )}
      {...props}
    />
  )
}

/**
 * `pin="end"` keeps the cell at the right edge while the row scrolls sideways
 * - the row's 「查看 / 更改」 (I39). Give the column's head and every one of
 * its cells the same pin.
 */
type Pin = { pin?: "end" }

function TableHead({ className, pin, ...props }: React.ComponentProps<"th"> & Pin) {
  return (
    <th
      data-slot="table-head"
      data-pin={pin}
      className={cn(
        "h-11 px-3.5 text-left align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  children,
  colSpan,
  pin,
  ...props
}: React.ComponentProps<"td"> & Pin) {
  return (
    <td
      data-slot="table-cell"
      data-pin={pin}
      colSpan={colSpan}
      className={cn(
        "px-3.5 py-2.5 align-middle whitespace-nowrap [overflow-wrap:normal] [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    >
      {colSpan ? (
        <div className="sticky left-0 flex w-[100cqw] max-w-[100cqw] sm:w-full sm:max-w-full items-center whitespace-normal">
          {children}
        </div>
      ) : children}
    </td>
  )
}

/**
 * A cell's content in a fitted table (I39): two lines at most, then 「…」, and
 * the whole text as the hover tip when - and only when - some of it is cut.
 */
function CellFit({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="cell-fit"
      className={cn("min-w-0", className)}
      onMouseEnter={(event) => {
        const text = clippedText(event.currentTarget)
        if (text) event.currentTarget.title = text
        else event.currentTarget.removeAttribute("title")
      }}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  CellFit,
}

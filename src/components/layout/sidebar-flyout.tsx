"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { badgeLabelKey } from "@/hooks/use-unread-badges";
import { isModifiedClick, isSamePage, openOnSamePage } from "@/lib/same-page-link";
import type { PortalFeatureKey } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** One row of a flyout: a page, or a heading with a further level. */
export interface FlyoutNode {
  key: string;
  label: string;
  href: string;
  active: boolean;
  /**
   * How many are waiting on this page; on a heading, the sum of the pages
   * under it (`menuWaiting`). Shown only above zero.
   */
  waiting?: number;
  children?: FlyoutNode[];
}

/**
 * A waiting count, the same pill on a sidebar entry and on every row of its
 * menus (Lucas 2026-10-09: 「hover的时候如果有事项也会看到号码在哪个分类」).
 *
 * Nothing at all unless the number is above zero (「如果是0的话就不用显示」):
 * zero, and counts that never loaded, look the same - an empty pile. Capped
 * at 99+ so a big pile keeps the menu its width. Named and titled by what it
 * counts (`badgeLabelKey`), the module's own wording.
 */
export function WaitingBadge({
  count,
  feature,
  className,
  ...rest
}: {
  count: number | undefined;
  feature: PortalFeatureKey;
  className?: string;
} & Record<`data-${string}`, string>) {
  const t = useTranslations();
  if (!count || count <= 0) return null;
  const name = t(badgeLabelKey(feature), { count });
  return (
    <span
      {...rest}
      className={cn(
        "ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none tabular-nums text-primary-foreground",
        className,
      )}
      aria-label={name}
      title={name}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Marks every flyout panel, so the sidebar can tell its own scrolls and clicks apart. */
export const FLYOUT_ATTRIBUTE = "data-nav-flyout";

const GAP = 6;
const MARGIN = 8;

/**
 * The desktop sidebar's cascading menu (B03, 图7).
 *
 * 「在左栏目那边点一下会跳出子栏目选项在右边，子栏目还有子栏目的话点了会在右边
 * 再跳出选项」: hovering an entry opens its children to the right of the
 * sidebar, and a child with children of its own opens the next level to the
 * right of that row. Every row is a link, so a click goes straight to the page.
 *
 * Portalled to <body> and positioned against the hovered row: the sidebar's
 * content scrolls, and anything absolutely positioned inside it would be cut
 * off at its edge. The panel is moved up when it would run off the bottom of
 * the window, and scrolls itself when it is taller than the window.
 *
 * Keyboard: the entry's arrow button opens it with focus on the first row;
 * Up/Down move, Right opens a heading, Left or Escape goes back a level.
 *
 * Each row carries its own waiting count, a heading the sum of its pages,
 * so the entry's number can be traced to the page it is on.
 */
export function NavFlyout({
  anchor,
  title,
  feature,
  nodes,
  focusFirst,
  onPointerEnter,
  onPointerLeave,
  onClose,
}: {
  anchor: DOMRect;
  title: string;
  /** The entry's feature, which names its counts (`badgeLabelKey`). */
  feature: PortalFeatureKey;
  nodes: FlyoutNode[];
  focusFirst: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  /** `restoreFocus` when the reader left by keyboard and focus has to go back. */
  onClose: (restoreFocus: boolean) => void;
}) {
  return createPortal(
    <FlyoutPanel
      anchor={anchor}
      title={title}
      feature={feature}
      nodes={nodes}
      focusFirst={focusFirst}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBack={() => onClose(true)}
      onNavigate={() => onClose(false)}
    />,
    document.body,
  );
}

function rowsOf(panel: HTMLElement | null): HTMLAnchorElement[] {
  return Array.from(
    panel?.querySelectorAll<HTMLAnchorElement>("[data-flyout-row]") ?? [],
  );
}

/** One level of the menu, and the level opened beside it. Exported for tests. */
export function FlyoutPanel({
  anchor,
  title,
  feature,
  nodes,
  focusFirst,
  onPointerEnter,
  onPointerLeave,
  onBack,
  onNavigate,
}: {
  anchor: DOMRect;
  title?: string;
  feature: PortalFeatureKey;
  nodes: FlyoutNode[];
  focusFirst: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onBack: () => void;
  onNavigate: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.top - 4);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [childAnchor, setChildAnchor] = useState<DOMRect | null>(null);
  const [focusChild, setFocusChild] = useState(false);

  // Measured after layout so the first painted frame is already in place.
  useLayoutEffect(() => {
    const height = panel.current?.offsetHeight ?? 0;
    const lowest = window.innerHeight - height - MARGIN;
    setTop(Math.max(MARGIN, Math.min(anchor.top - 4, lowest)));
  }, [anchor.top, nodes.length]);

  useLayoutEffect(() => {
    if (focusFirst) rowsOf(panel.current)[0]?.focus();
  }, [focusFirst]);

  const rows = () => rowsOf(panel.current);

  const openChild = (node: FlyoutNode, row: HTMLElement, withFocus: boolean) => {
    if (!node.children?.length) {
      setOpenKey(null);
      return;
    }
    setChildAnchor(row.getBoundingClientRect());
    setFocusChild(withFocus);
    setOpenKey(node.key);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, node: FlyoutNode) => {
    const list = rows();
    const index = list.findIndex((row) => row === document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(index + step + list.length) % list.length]?.focus();
    } else if (event.key === "ArrowRight" && node.children?.length) {
      event.preventDefault();
      openChild(node, event.currentTarget, true);
    } else if (event.key === "ArrowLeft" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onBack();
    }
  };

  const open = nodes.find((node) => node.key === openKey);

  return (
    <>
      <div
        ref={panel}
        {...{ [FLYOUT_ATTRIBUTE]: "" }}
        role="menu"
        aria-label={title}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className="fixed z-50 flex max-h-[calc(100dvh-1rem)] min-w-52 max-w-72 flex-col overflow-y-auto overscroll-contain rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        style={{ left: anchor.right + GAP, top }}
      >
        {title && (
          <p className="truncate px-2.5 pb-1 pt-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
        )}
        {nodes.map((node) => (
          <Link
            key={node.key}
            href={node.href}
            prefetch={false}
            role="menuitem"
            data-flyout-row=""
            aria-haspopup={node.children?.length ? "menu" : undefined}
            aria-expanded={node.children?.length ? openKey === node.key : undefined}
            aria-current={node.active && !node.children?.length ? "page" : undefined}
            onPointerEnter={(event) => openChild(node, event.currentTarget, false)}
            onKeyDown={(event) => onKeyDown(event, node)}
            onClick={(event) => {
              // Same page, other tab: switch at once instead of waiting on
              // the server for a route that is already showing.
              if (!isModifiedClick(event) && isSamePage(node.href)) {
                event.preventDefault();
                openOnSamePage(node.href);
              }
              onNavigate();
            }}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
              node.active && "bg-primary/10 font-medium text-primary",
              openKey === node.key && "bg-accent/70",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            <WaitingBadge
              count={node.waiting}
              feature={feature}
              data-flyout-badge={node.key}
            />
            {node.children?.length ? (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            ) : null}
          </Link>
        ))}
      </div>
      {open?.children?.length && childAnchor ? (
        <FlyoutPanel
          key={open.key}
          anchor={childAnchor}
          feature={feature}
          nodes={open.children}
          focusFirst={focusChild}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onBack={() => {
            setOpenKey(null);
            rows().find((row) => row.getAttribute("aria-expanded") === "true")?.focus();
          }}
          onNavigate={onNavigate}
        />
      ) : null}
    </>
  );
}

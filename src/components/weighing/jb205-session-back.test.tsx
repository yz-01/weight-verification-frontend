/**
 * JB205-10 (Lucas 11-16 audit) - a weighing session's 「返回」.
 *
 * It always went to /weighing, which lands MSE staff on 地磅登记 whatever
 * list - 实时称重, 异常, 查询 - they opened the session from. It now goes back
 * when there is somewhere to go back to (the in-app trail), and to /weighing
 * only when the session was opened on its own. `DetailHeader` takes the
 * optional `onBack`; every other caller leaves it out and is unchanged.
 */
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { decideDismiss } from "@/components/shared/dialog-navigation";
import { DetailHeader } from "@/components/shared/page-primitives";
import zh from "@/messages/zh.json";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

type LinkProps = { href: string; onClick?: (event: Record<string, unknown>) => void };

/** The back link `DetailHeader` draws on a page, as an element with its props. */
function backLink(props: Parameters<typeof DetailHeader>[0]): LinkProps {
  let tree: unknown = null;
  function Probe() {
    tree = DetailHeader(props);
    return null;
  }
  renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
      <Probe />
    </NextIntlClientProvider>,
  );
  if (!isValidElement(tree)) throw new Error("DetailHeader drew nothing");
  const [link] = ([] as unknown[]).concat((tree.props as { children: unknown }).children);
  if (!isValidElement(link)) throw new Error("no back link");
  return link.props as LinkProps;
}

describe("「返回」 on a weighing session", () => {
  it("goes back instead of following the link, and keeps the link for a new tab", () => {
    const onBack = vi.fn();
    const preventDefault = vi.fn();
    const link = backLink({ backHref: "/weighing", backLabel: "称重", onBack });

    expect(link.href).toBe("/weighing");
    link.onClick?.({ preventDefault, metaKey: false, ctrlKey: false, shiftKey: false });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();

    // Ctrl-click still opens /weighing in a new tab.
    link.onClick?.({ preventDefault, metaKey: false, ctrlKey: true, shiftKey: false });
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("every other page's back link is a plain link, as before", () => {
    expect(backLink({ backHref: "/receipts", backLabel: "收货" }).onClick).toBeUndefined();
  });

  it("goes back when the session was opened from a list, to /weighing when it was not", () => {
    expect(decideDismiss({ surface: "page", fallbackHref: "/weighing", visited: ["/weighing/admin/live", "/weighing/s-1"] })).toEqual({ action: "back" });
    expect(decideDismiss({ surface: "page", fallbackHref: "/weighing", visited: ["/weighing/s-1"] })).toEqual({ action: "push", href: "/weighing" });
  });

  it("the session page uses it", () => {
    const source = read("src/components/weighing/view-weigh-session.tsx");
    expect(source).toContain('const goBack = useDismissDialog("/weighing", "page");');
    expect(source).toMatch(/<DetailHeader\n\s+backHref="\/weighing"\n\s+backLabel=\{t\("weighing\.title"\)\}\n\s+onBack=\{goBack\}/);
  });
});

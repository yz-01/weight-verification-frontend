import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The phone takes its own position; the worker does not press for it (T-355).
 *
 * 客户开工前第 4 问：「现场工作人员的 GPS 是自动获取的，他们申请任何东西都是自动
 * 获取，**不需要自己点获取 GPS 定位**」, confirmed three times since (D-226,
 * D-237, D-246): 「常态路径上不出现『获取定位』按钮；只有在自动定位失败时才露出
 * 重试」.
 *
 * Every field form shares this one component, which is why it is guarded here
 * rather than form by form: a button put back in this file is a button put back
 * on every screen at once.
 *
 * Source-level, because this repository's unit tests run without a DOM. The
 * assertions are about structure that decides behaviour - where the request is
 * made from, and under what condition a button renders at all.
 */
const code = readFileSync(
  path.join(process.cwd(), "src", "components", "field-staff", "location-field.tsx"),
  "utf8",
);

function componentBody() {
  const start = code.indexOf("export function LocationField");
  expect(start, "LocationField not found - was it renamed?").toBeGreaterThan(-1);
  return code.slice(start);
}

describe("location is taken automatically (T-355, D-246)", () => {
  it("asks for a fix from an effect, not only from a press", () => {
    const body = componentBody();
    const effect = body.slice(body.indexOf("useEffect("));
    expect(body).toContain("useEffect(");
    expect(effect.slice(0, effect.indexOf("}, ["))).toContain("void ask()");
  });

  it("keeps the one-time explanation before the very first request", () => {
    // D-226: 「第一次使用只需授权一次」. An unexplained system prompt is
    // answered Don't Allow and remembered, so the first request stays behind
    // the sentence.
    const body = componentBody();
    const effect = body.slice(body.indexOf("useEffect("));
    // The automatic request waits until the explanation has been read once…
    expect(effect.slice(0, effect.indexOf("}, ["))).toContain("!primerRead");
    // …and on a first use the explanation shows by itself, with no button.
    expect(body).toContain("const showPrimer = !value && !primerRead && !primerDismissed;");
  });

  it("renders no locate button on the normal path", () => {
    // The only non-retry button is gated on the person having dismissed the
    // explanation. If it ever renders unconditionally again, the worker is
    // back to pressing a button on every form.
    const body = componentBody();
    const actionButton = body.indexOf("{actionLabel}");
    expect(actionButton).toBeGreaterThan(-1);
    const guard = body.lastIndexOf("{primerDismissed", actionButton);
    expect(guard, "the locate button must sit behind primerDismissed").toBeGreaterThan(-1);
    expect(body.slice(guard, actionButton)).not.toContain("</Button>");
  });

  it("still offers a retry when the automatic attempt fails", () => {
    expect(componentBody()).toContain('t("retry")');
  });
});

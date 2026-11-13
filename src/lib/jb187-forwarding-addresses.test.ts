/**
 * JB187 (客户 11-13): 「打开事项，然后按 X 一直会重新弹出来」「整个后台切换不到
 * 页面」.
 *
 * A system notification opens 通知中心 at `?notice=<id>` (`public/sw.js`,
 * `notification_links.push_url`). That address went on to the notice's record
 * with `router.push`, leaving `?notice=<id>` in history under the record.
 * The record's X is "back one entry": back at `?notice=<id>` the page went on
 * to the record again - for ever. The recycler's new-order link
 * (`/incoming?dispatch=<id>`) had the same shape.
 *
 * The rule these pin: **an address that goes on to another by itself first
 * lets go of what made it do so** (`dropFromAddress`, at once, in the entry it
 * has), or replaces itself. And no page may `router.push` from an effect
 * unless it is listed here with why going back to it does not push again.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");

/** A source file as LF text (a Windows checkout has CRLF). */
function read(relative: string): string {
  return readFileSync(path.join(SRC, relative), "utf8").replace(/\r\n/g, "\n");
}

function sources(directory: string, found: string[] = []): string[] {
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) sources(full, found);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push(full);
  }
  return found;
}

/** The bodies of every `useEffect(() => { ... })` in `text`. */
function effectBodies(text: string): string[] {
  const bodies: string[] = [];
  const opener = /useEffect\(\s*\(\)\s*=>\s*\{/g;
  for (let match = opener.exec(text); match; match = opener.exec(text)) {
    let at = match.index + match[0].length;
    let depth = 1;
    while (at < text.length && depth > 0) {
      if (text[at] === "{") depth += 1;
      else if (text[at] === "}") depth -= 1;
      at += 1;
    }
    bodies.push(text.slice(match.index + match[0].length, at));
  }
  return bodies;
}

describe("通知中心: a notice a link named goes on to its record", () => {
  const page = read("components/notifications/notifications.tsx");

  it("lets go of ?notice= before it goes on, so the record's X comes back to 通知中心", () => {
    const handler = page.slice(page.indexOf("navigate={(href) => {"));
    const drop = handler.indexOf('dropFromAddress(["notice"]);');
    const push = handler.indexOf("router.push(href);");
    expect(drop, "the address lets go of the notice").toBeGreaterThan(-1);
    expect(push, "then goes on to the record").toBeGreaterThan(drop);
    // Nothing between the two that could leave the entry as it was.
    expect(handler.slice(drop, push)).not.toContain("router.replace");
  });
});

describe("回收商的新订单链接: an order past assigning opens in its own window", () => {
  const page = read("components/incoming/incoming.tsx");

  it("lets go of ?dispatch= before it goes on", () => {
    const drop = page.indexOf('dropFromAddress(["dispatch"]);');
    const push = page.indexOf("router.push(`/dispatches/${linkedDispatchId}`);");
    expect(drop).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(drop);
    // `router.replace` (clearLinkedDispatch) then `router.push` left it in:
    // the push supersedes the replace that is still on its way.
    expect(page.slice(drop, push)).not.toContain("clearLinkedDispatch()");
  });
});

describe("项目窗口的「添加成员」: scrolled to, with no history entry of its own", () => {
  it("does not let the browser navigate to #project-team (the X would only take the # away)", () => {
    const page = read("components/projects/view-project.tsx");
    const link = page.slice(page.indexOf('href="#project-team"'));
    expect(link.slice(0, link.indexOf("</a>"))).toContain("event.preventDefault();");
    expect(link.slice(0, link.indexOf("</a>"))).toContain('getElementById("project-team")');
  });

  it("is the only plain in-page link in the console", () => {
    const found = sources(SRC)
      .filter((file) => /href="#/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file).replace(/\\/g, "/"));
    expect(found).toEqual(["components/projects/view-project.tsx"]);
  });
});

/**
 * `router.push` inside an effect is an address that forwards by itself. Each
 * one here says why coming back to it does not forward again.
 */
const PUSHES_FROM_AN_EFFECT: Record<string, string> = {
  // Only on the Esc key, never on arriving at the page.
  "components/dashboard/headquarters-wall.tsx": "a key handler",
  // After `dropFromAddress(["dispatch"])` (above).
  "components/incoming/incoming.tsx": "lets go of ?dispatch= first",
};

describe("no address forwards by itself with a push and stays in history", () => {
  it("every router.push inside an effect is one of the listed ones", () => {
    const found = sources(SRC)
      .filter((file) =>
        effectBodies(readFileSync(file, "utf8")).some((body) => body.includes("router.push(")),
      )
      .map((file) => path.relative(SRC, file).replace(/\\/g, "/"))
      .sort();
    expect(found).toEqual(Object.keys(PUSHES_FROM_AN_EFFECT).sort());
  });

  it("the notice opener, which forwards through its caller, has two callers only", () => {
    const callers = sources(SRC)
      .filter((file) => readFileSync(file, "utf8").includes("<NoticeOpener"))
      .map((file) => path.relative(SRC, file).replace(/\\/g, "/"))
      .sort();
    // The phone replaces its address (`router.replace`); the office lets go
    // of the notice and pushes (above). A third caller must do one of the two.
    expect(callers).toEqual([
      "components/field-staff/field-staff-workspace.tsx",
      "components/notifications/notifications.tsx",
    ]);
    const phone = read("components/field-staff/field-staff-workspace.tsx");
    expect(phone).toContain(
      "const openNoticeHref = useCallback((href: string) => router.replace(href), [router]);",
    );
  });
});

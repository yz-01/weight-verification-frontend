/**
 * 工地门禁's sidebar entries switch the page (Lucas 2026-10-10, 图4):
 * 「我点了那个sidebar其中一个然后点了另一个不会切换」.
 *
 * Both entries under 工地门禁 open the same page - 「通行证」 is
 * `/site-access`, 「门岗扫码」 is `/site-access?tab=gate`. Going from one to
 * the other changes only the address's `?tab=`, so Next.js keeps the page
 * mounted and only `useSearchParams` changes. The page used to read the tab
 * once, into state, when it first mounted - and kept showing that tab
 * whatever the address said afterwards. (门岗拍照记录 moved to
 * EHS › 门岗记录 in batch H; its old addresses forward there.)
 *
 * The runner has no DOM, so "still mounted" is played here: the page is
 * rendered once at the first address, and rendered again at the next one
 * with its own `useState` slots handed back as they were - what React does
 * for a component that stays on screen.
 */
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { navLeaves, PORTAL_NAVIGATION } from "@/lib/navigation";
import messages from "@/messages/zh.json";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/site-access",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

/**
 * The page's own state slots, kept from one render to the next while
 * `mounted.keep` is on. Only the slots `SiteAccessWorkspace` itself asks for:
 * its tabs' contents differ from one render to the next, so theirs would not
 * line up - and they are not what is being tested.
 */
const mounted = vi.hoisted(() => ({
  keep: false,
  slots: [] as unknown[],
  next: 0,
}));
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  function useState<S>(initial: S | (() => S)) {
    const caller = new Error().stack?.split("\n")[2] ?? "";
    const own = /\bSiteAccessWorkspace\b/.test(caller);
    const slot = own ? mounted.next++ : -1;
    const seed =
      own && mounted.keep && slot < mounted.slots.length
        ? (mounted.slots[slot] as S)
        : initial;
    const pair = real.useState<S>(seed);
    if (own) mounted.slots[slot] = pair[0];
    return pair;
  }
  return { ...real, default: { ...real, useState }, useState };
});

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["all", () => {}],
  useProjectBoxShown: () => true,
}));
vi.mock("@/components/site-access/gate-qr-scanner", () => ({
  GateQrScanner: () => null,
  decodeGateQrImage: vi.fn(),
}));
const { SiteAccessWorkspace, movedGateRecordsHref } = await import(
  "@/components/site-access/site-access-workspace"
);

function render(search: string) {
  nav.search = search;
  mounted.next = 0;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <SiteAccessWorkspace />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** The tab the page shows: the one trigger Radix marks active. */
function shownTab(html: string): string {
  const active = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes('data-state="active"'));
  expect(active).toHaveLength(1);
  const id = /aria-controls="[^"]*-content-([a-z-]+)"/.exec(active[0]);
  return id?.[1] ?? "";
}

/** Opens the page at `first`, then moves the address to each of `then` in turn. */
function stayOnPage(first: string, ...then: string[]): string[] {
  mounted.keep = false;
  mounted.slots = [];
  const seen = [shownTab(render(first))];
  mounted.keep = true;
  for (const search of then) seen.push(shownTab(render(search)));
  mounted.keep = false;
  return seen;
}

const siteAccess = PORTAL_NAVIGATION.MSE_TRACE.find((item) => item.feature === "site_access");
const entry = (labelKey: string) =>
  navLeaves(siteAccess?.children).find((leaf) => leaf.labelKey === labelKey)!.href;
const query = (href: string) => href.split("?", 2)[1] ?? "";

describe("工地门禁's sidebar entries switch the page (图4)", () => {
  beforeEach(() => {
    mounted.keep = false;
    mounted.slots = [];
  });

  it("opens each entry on its own tab", () => {
    expect(shownTab(render(query(entry("nav.submodule.siteAccessPasses"))))).toBe("passes");
    expect(shownTab(render(query(entry("nav.submodule.gateScanning"))))).toBe("gate");
  });

  it("follows the second entry clicked while the page is still open, both ways", () => {
    const passes = query(entry("nav.submodule.siteAccessPasses"));
    const gate = query(entry("nav.submodule.gateScanning"));
    expect(stayOnPage(passes, gate, passes, gate)).toEqual([
      "passes",
      "gate",
      "passes",
      "gate",
    ]);
  });

  it("forwards an old 门岗拍照记录 link to EHS › 门岗记录, record and project along (HD9)", () => {
    const at = (search: string) => movedGateRecordsHref(new URLSearchParams(search));
    expect(at("tab=gate-records&gate_incident=g1&project=p1")).toBe(
      "/gate-records?gate_incident=g1&project=p1",
    );
    expect(at("tab=gate-records")).toBe("/gate-records");
    expect(at("gate_incident=g2")).toBe("/gate-records?gate_incident=g2");
    expect(at("tab=gate")).toBeNull();
    expect(at("")).toBeNull();
  });

  it("keeps every tab in the address, so a link or a refresh lands on it", () => {
    for (const tab of ["passes", "gate", "devices"]) {
      expect(shownTab(render(tab === "passes" ? "" : `tab=${tab}`))).toBe(tab);
    }
  });
});

describe("工地门禁 says what each tab is for (图6)", () => {
  it("puts one plain line under the tabs for the open tab", () => {
    const tabs = messages.siteControl.access.tabHelp as Record<string, string>;
    for (const tab of ["passes", "gate", "devices"]) {
      const html = render(tab === "passes" ? "" : `tab=${tab}`);
      expect(html).toContain(`data-tab-help="${tab}"`);
      expect(html).toContain(tabs[tab]);
    }
  });

  it("calls the machine log by what it is, not 设备事件", () => {
    const html = render("tab=devices");
    expect(html).toContain("闸机记录");
    expect(html).not.toContain("设备事件");
  });
});

describe("访客扫码 leads with the camera (图5, HD7)", () => {
  const scan = messages.siteControl.visitorScan;

  it("opens on the camera, with typing folded under 其他方式", () => {
    const html = render("tab=gate");
    expect(html).toContain("data-gate-camera");
    expect(html).toContain(scan.otherWays);
    expect(html).toMatch(/aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*其他方式/);
    // Folded: no box to type in until it is opened.
    expect(html).not.toContain(scan.typePlaceholder);
  });

  it("records nothing by scanning: no confirm button until a pass is read, and no photo", () => {
    const html = render("tab=gate");
    // The words appear in the help line; the buttons (their icons) do not.
    expect(html).not.toContain("lucide-log-in");
    expect(html).not.toContain("lucide-log-out");
    expect(html).toContain(scan.confirmEntry);
    expect(html).not.toContain('capture="environment"');
  });
});

describe("menu entries that share one page", () => {
  /**
   * The pages whose tab follows the address, so two menu entries can point at
   * one of them with different `?tab=`s. A new pair of entries sharing a page
   * has to join this list - after its page is made to follow the address the
   * way 工地门禁's is above.
   */
  const FOLLOWS_ADDRESS = new Set([
    "/site-access",
    // 日常拍照记录 / 门岗事项 (I25): `gate-records-office.test.tsx` holds it
    // to the same rule.
    "/gate-records",
  ]);

  it("only point at pages that follow the address", () => {
    // Within one portal's menu: the same page listed in two portals' menus
    // is one entry each, not two entries on one screen.
    for (const [portal, items] of Object.entries(PORTAL_NAVIGATION)) {
      const pages = new Map<string, Set<string>>();
      for (const item of items) {
        for (const leaf of navLeaves(item.children)) {
          const page = leaf.href.split("?", 1)[0];
          pages.set(page, (pages.get(page) ?? new Set()).add(leaf.href));
        }
      }
      for (const [page, hrefs] of pages) {
        if (hrefs.size < 2) continue;
        expect(FOLLOWS_ADDRESS, `${portal}: ${[...hrefs].join(", ")}`).toContain(page);
      }
    }
  });
});

/**
 * JB227 (客户 11-19 事项 7): 「手机端的「设备操作员工时」必须限制打卡权限。现场人员
 * 不能代替设备司机打卡。只有绑定了对应设备的司机手机端，才允许进行设备工时打卡。没有
 * 绑定设备的手机，一律不允许打卡。」
 *
 * - the site staff's tile only reads now, saying who clocks and whom to ask;
 * - a driver phone (the operator's 设备操作, a driver's link) is offered only
 *   its bound machines, says which, and with none says whom to ask instead of
 *   offering a scan;
 * - the office's 【设备绑定司机】: machines nobody can clock first, the
 *   release's pre-bound ones marked until 【确认】, a page line for both.
 *
 * Rendered to static markup with the server's answers already in the cache
 * (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import type { DriverBindings } from "@/services/driver-clock.service";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1" }, can: () => true }),
}));

const { EquipmentHoursCapture, boundMachinesLine, scanMissKind } = await import(
  "@/components/equipment-hours/equipment-hours-capture"
);
const { isSystemMachineQr } = await import("@/lib/machine-scan");
const { SiteStaffHoursView } = await import("@/components/equipment-hours/site-staff-hours-view");
const {
  DriverBindingHints,
  DriverBindingsBody,
  RunningUnbindWarning,
  driversOf,
  hasSeeded,
  strandedDriver,
  ticksChanged,
} = await import("@/components/equipment-hours/driver-bindings");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const phone = zh.equipmentHours.phone;
const office = zh.driverBinding;

function machine(id: string, siteNo: string, name: string) {
  return {
    id,
    site_no: siteNo,
    code: `EQ-${siteNo}`,
    name,
    plate: "",
    supplier_name: "",
    open_since: null,
    unclosed_since: null,
  };
}

function render(node: React.ReactNode, cache: [readonly unknown[], unknown][] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, value] of cache) client.setQueryData(key, value);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const OPERATOR_KEY = ["equipment-hours", "machines", "project-1", ""] as const;
const LINK_KEY = ["equipment-hours", "machines", "driver-link", "link-token"] as const;

describe("a driver phone is offered only its bound machines (JB227-3 / -4)", () => {
  it("with nothing bound, the operator's page says whom to ask and offers no scan", () => {
    const html = render(<EquipmentHoursCapture initialProject="project-1" operator />, [[OPERATOR_KEY, []]]);

    expect(html).toContain(phone.notBound);
    expect(html).toContain('data-testid="hours-not-bound"');
    expect(html).not.toContain(phone.scanBig);
    expect(html).not.toContain(phone.brokenQr);
  });

  it("with nothing bound, a driver's link says the same", () => {
    const html = render(<EquipmentHoursCapture driver={{ token: "link-token", device: "phone-1" }} />, [[LINK_KEY, []]]);

    expect(html).toContain(phone.notBound);
    expect(html).not.toContain(phone.scanBig);
  });

  it("bound, it names his machines above the scan button", () => {
    const html = render(<EquipmentHoursCapture initialProject="project-1" operator />, [
      [OPERATOR_KEY, [machine("m12", "12", "挖土机"), machine("m15", "15", "吊车")]],
    ]);

    expect(html).toContain("你可以打卡的设备：12 号 · 挖土机、15 号 · 吊车");
    expect(html).toContain(phone.scanBig);
    expect(html).not.toContain(phone.notBound);
  });

  it("names three and counts the rest", () => {
    const t = (key: string, values?: Record<string, string | number>) => {
      const words = (phone as Record<string, string>)[key.replace("phone.", "")];
      return words.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ""));
    };
    const rows = ["1", "2", "3", "4", "5"].map((n) => machine(`m${n}`, n, `机${n}`));

    expect(boundMachinesLine(rows, t)).toBe("你可以打卡的设备：1 号 · 机1、2 号 · 机2、3 号 · 机3 等 5 台");
  });

  it("a scan of another machine says it is not his, in plain words", () => {
    const capture = readFileSync(
      path.join(process.cwd(), "src/components/equipment-hours/equipment-hours-capture.tsx"),
      "utf8",
    );
    expect(capture).toMatch(/if \(kind === "notYourMachine"\) return t\("phone\.notYourMachine"\)/);
    expect(capture).toMatch(/t\(bound \? "phone\.notYourMachine" : "phone\.typedNoMatch"\)/);
    expect(phone.notYourMachine).toBe(
      "这台设备不在你可以打卡的设备里。看看设备号码对不对；办公室刚为你绑定的话，到有信号的地方重新打开这一页。还是不行，请联系项目办公室。",
    );
  });
});

describe("audit fix round (11-20): a scan that names none of the driver's machines (F7)", () => {
  const ID = "3f2b8c1e-5a4d-4e6f-9a7b-0c1d2e3f4a5b";

  it("tells the system's code of another machine from a sticker or a bad read", () => {
    expect(isSystemMachineQr(`https://mse-trace.example/scan/equipment?equipment=${ID}`)).toBe(true);
    expect(isSystemMachineQr(ID)).toBe(true);
    expect(isSystemMachineQr("https://supplier.example/fleet?code=EX-12")).toBe(false);
    expect(isSystemMachineQr("WXY 1234")).toBe(false);
    expect(isSystemMachineQr("%%#garbled")).toBe(false);

    expect(scanMissKind(`https://mse-trace.example/scan/equipment?equipment=${ID}`, true)).toBe("notYourMachine");
    expect(scanMissKind("https://supplier.example/fleet?code=EX-12", true)).toBe("qrUnknown");
    expect(scanMissKind("%%#garbled", true)).toBe("qrUnknown");
    // Not a driver phone: the old sentence.
    expect(scanMissKind("%%#garbled", false)).toBe("qrNoMatch");
    expect(phone.qrUnknown).toContain("{text}");
    expect(phone.qrUnknown).toContain(phone.brokenQr);
    expect(phone.qrUnknown).not.toBe(phone.notYourMachine);
  });

  it("reads its machines again before saying a machine is not his, and after a refusal", () => {
    const capture = readFileSync(
      path.join(process.cwd(), "src/components/equipment-hours/equipment-hours-capture.tsx"),
      "utf8",
    );
    // A binding the office made while the phone had no signal.
    expect(capture).toMatch(/void machines\.refetch\(\)\.then/);
    expect(capture).toMatch(/missed\(\(list\) => matchScannedMachine\(text, list\), \(\) => sayScanMiss\(text\)\)/);
    expect(capture).toMatch(/missed\(\s*\(list\) => matchTypedMachine\(typed, list\)/);
    expect(capture).toMatch(/reason\.code === "equipment_hours_not_bound" \|\| reason\.code === "equipment_hours_no_longer_bound"/);
  });
});

describe("the site staff's 设备操作员工时 only reads (JB227-2)", () => {
  it("says who clocks and whom to ask, and keeps the recent hours, with no scan", () => {
    const html = render(<SiteStaffHoursView initialProject="project-1" />);

    expect(html).toContain(phone.staffViewOnly);
    expect(html).toContain(zh.equipmentHours.records.staffTitle);
    expect(html).not.toContain(phone.scanBig);
  });

  it("is what the tile opens; the tile itself stays (only 打卡 is restricted)", () => {
    const panel = readFileSync(path.join(process.cwd(), "src/components/field-staff/field-records-panel.tsx"), "utf8");

    expect(panel).toMatch(/key: "operatorHours", permission: "equipment\.capture"/);
    expect(panel).toMatch(/<SiteStaffHoursView initialProject=/);
    expect(panel).not.toMatch(/<EquipmentHoursCapture/);
  });
});

function overview(over: Partial<DriverBindings> = {}): DriverBindings {
  return {
    machines: [
      { id: "m18", number: "18", site_no: "18", code: "EQ-18", name: "压路机", plate: "", drivers: [] },
      {
        id: "m12",
        number: "12",
        site_no: "12",
        code: "EQ-12",
        name: "挖土机",
        plate: "WXY 1234",
        drivers: [
          {
            kind: "account",
            id: "u1",
            name: "Ali",
            cidb_no: "",
            company_name: "",
            binding: "b1",
            bound_at: "2026-11-20T00:00:00Z",
            source: "SEEDED",
          },
          {
            kind: "link",
            id: "l1",
            name: "Muthu",
            cidb_no: "C-1",
            company_name: "Muthu Transport",
            binding: "b2",
            bound_at: "2026-11-20T00:00:00Z",
            source: "OFFICE",
          },
        ],
      },
    ],
    drivers: [
      { kind: "account", id: "u1", name: "Ali", cidb_no: "", company_name: "", machines: ["m12"] },
      { kind: "link", id: "l1", name: "Muthu", cidb_no: "C-1", company_name: "Muthu Transport", machines: ["m12"] },
    ],
    unbound_machines: 1,
    seeded_machines: 1,
    ...over,
  };
}

const BINDINGS_KEY = ["driver-bindings", "project-1"] as const;

describe("【设备绑定司机】 on the office page (JB227-3)", () => {
  it("lists machines nobody can clock first, each driver with its kind, and the pre-bound to check", () => {
    const html = render(<DriverBindingsBody project="project-1" />, [[BINDINGS_KEY, overview()]]);

    expect(html.indexOf("18 号 · 压路机")).toBeLessThan(html.indexOf("12 号 · 挖土机 · WXY 1234"));
    expect(html).toContain(office.nobody);
    expect(html).toContain(office.kind.account);
    expect(html).toContain(office.kind.link);
    expect(html).toContain(office.seeded);
    expect(html).toContain(office.confirm);
    expect(html).toContain(office.seededHelp.replace("{count}", "1"));
    expect(html).toContain(office.edit);
  });

  it("with no driver yet, says where to make one", () => {
    const html = render(<DriverBindingsBody project="project-1" />, [
      [BINDINGS_KEY, overview({ drivers: [], seeded_machines: 0 })],
    ]);

    expect(html).toContain(office.noDrivers);
    expect(html).not.toContain(office.seededHelp.slice(0, 8));
  });

  it("asks for a project first", () => {
    expect(render(<DriverBindingsBody project="" />)).toContain(office.chooseProject);
  });

  it("puts both lines on the page while there is something to do, and nothing after", () => {
    const html = render(<DriverBindingHints project="project-1" />, [[BINDINGS_KEY, overview()]]);
    expect(html).toContain(office.seededLine.replace("{count}", "1"));
    expect(html).toContain(office.unboundLine.replace("{count}", "1"));

    const done = render(<DriverBindingHints project="project-1" />, [
      [BINDINGS_KEY, overview({ unbound_machines: 0, seeded_machines: 0 })],
    ]);
    expect(done).toBe("");
  });

  it("says so when the overview cannot be read, instead of no line", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
    });
    const query = client.getQueryCache().build(client, { queryKey: [...BINDINGS_KEY] });
    query.setState({ ...query.state, status: "error", error: new Error("down") });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
          <DriverBindingHints project="project-1" />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(html).toContain(zh.common.loadFailed.replace("{what}", office.title));
  });

  it("knows a changed tick list, and sends what the server takes", () => {
    const row = overview().machines[1];

    expect(ticksChanged(row, ["account:u1", "link:l1"])).toBe(false);
    expect(ticksChanged(row, ["link:l1"])).toBe(true);
    expect(ticksChanged(row, ["account:u1", "link:l1", "account:u9"])).toBe(true);
    expect(hasSeeded(row)).toBe(true);
    expect(driversOf(["account:u1", "link:l1"])).toEqual([
      { kind: "account", id: "u1" },
      { kind: "link", id: "l1" },
    ]);
  });

  it("is on the page beside 司机打卡链接, and a link's row says what it may clock", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/components/equipment-hours/equipment-operator-hours.tsx"),
      "utf8",
    );
    const links = readFileSync(path.join(process.cwd(), "src/components/equipment-hours/driver-clock-links.tsx"), "utf8");

    expect(page).toMatch(/tRoot\("driverBinding\.open"\)/);
    expect(page).toMatch(/<DriverBindingHints project=/);
    expect(links).toMatch(/t\("office\.noMachines"\)/);
    expect(links).toMatch(/t\("office\.nextStep"\)/);
  });
});

describe("audit fix round (11-20): the office does not strand a running machine without knowing (F1)", () => {
  const running = { kind: "link" as const, id: "l1", name: "Muthu", since: "2026-11-20T00:00:00Z" };

  it("knows when the ticks would untick the driver who is running the machine", () => {
    const row = { ...overview().machines[1], running };

    expect(strandedDriver(row, ["account:u1"])).toEqual(running);
    expect(strandedDriver(row, ["account:u1", "link:l1"])).toBeNull();
    // Nobody running it, or started by someone who is not bound (site staff
    // before the update): nothing to warn about.
    expect(strandedDriver({ ...row, running: null }, [])).toBeNull();
    expect(strandedDriver({ ...row, running: { ...running, kind: "account", id: "staff-1" } }, [])).toBeNull();
  });

  it("says who started it, since when and what happens, before 【保存】", () => {
    const html = render(<RunningUnbindWarning running={running} />);

    expect(html).toContain('data-testid="binding-running-warning"');
    expect(html).toContain("Muthu 现在正开着这台设备（");
    expect(html).toContain("开工）。取消绑定后他的手机不能收工。请等他收工后再取消；一定要现在取消的，保存后请在工时记录里替他【补结束时间】。");
    expect(office.runningWarn).toContain(zh.equipmentHours.adjust.add);
  });

  it("asks for the explicit 「确定」 and sends it; a refusal reads the list again", () => {
    const dialog = readFileSync(path.join(process.cwd(), "src/components/equipment-hours/driver-bindings.tsx"), "utf8");

    expect(dialog).toMatch(/stranded \? <RunningUnbindWarning running=\{stranded\} \/> : null/);
    expect(dialog).toMatch(/stranded \? t\("saveUnbindRunning"\) : t\("save"\)/);
    expect(dialog).toMatch(/confirmRunning: Boolean\(stranded\)/);
    expect(dialog).toMatch(/confirmRunning \? \{ confirm_running: true \} : \{\}/);
    expect(dialog).toMatch(/reason\.code === "equipment_binding_driver_running"/);
    expect(zh.errors.api.equipment_binding_driver_running).toContain(office.saveUnbindRunning);
  });

  it("the unbound driver's refused 收工 says whom to ask", () => {
    expect(zh.errors.api.equipment_hours_no_longer_bound).toBe(
      "你已经不是这台设备的绑定司机，不能收工。请联系后台替你补结束时间。",
    );
  });
});

describe("the words are there in all four languages", () => {
  it("has every new sentence in 中文, 繁體, English and Malay", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const code of [
        "equipment_hours_driver_only",
        "equipment_hours_not_bound",
        "equipment_binding_driver_invalid",
        "equipment_hours_no_longer_bound",
        "equipment_binding_driver_running",
      ]) {
        expect((messages.errors.api as Record<string, string>)[code]).toBeTruthy();
      }
      for (const key of ["notBound", "notYourMachine", "qrUnknown", "staffViewOnly", "boundLine", "boundMore"]) {
        expect((messages.equipmentHours.phone as Record<string, string>)[key]).toBeTruthy();
      }
      expect(messages.driverBinding.open).toBeTruthy();
      expect(messages.driverBinding.runningWarn).toMatch(/\{name\}[\s\S]*\{time\}/);
      expect(messages.errors.api.equipment_binding_driver_running).toMatch(/\{name\}[\s\S]*\{time\}/);
      expect(messages.driverBinding.saveUnbindRunning).toBeTruthy();
      expect(messages.audit.operation.equipment_driver_binding_set).toBeTruthy();
    }
    expect(zhTW.equipmentHours.phone.notBound).toContain("綁定");
    expect(zhTW.errors.api.equipment_hours_no_longer_bound).toContain("綁定司機");
    expect(en.driverBinding.open).toBe("Bind drivers to machines");
  });

  it("the site staff's refusal says who clocks and whom to ask (F6)", () => {
    expect(zh.errors.api.equipment_hours_driver_only).toContain("请让这台设备的绑定司机用他自己的手机打卡");
    expect(zh.errors.api.equipment_hours_driver_only).toContain("「设备操作员工时 › 设备绑定司机」");
    expect(zhTW.errors.api.equipment_hours_driver_only).toContain("「設備操作員工時 › 設備綁定司機」");
    expect(en.errors.api.equipment_hours_driver_only).toContain(en.driverBinding.open);
  });

  it("the permission now says what it gives (F5), the code unchanged", () => {
    expect(zh.permissions.code.equipment.capture).toBe("现场登记设备进退场，查看设备工时");
    expect(zhTW.permissions.code.equipment.capture).toBe("現場登記設備進退場，查看設備工時");
    expect(en.permissions.code.equipment.capture).not.toMatch(/hours on site/);
    expect(ms.permissions.code.equipment.capture).toMatch(/lihat jam/);
  });
});

/**
 * 设备操作员工时 (2026-10 B15; by in/out pairs since 2026-10-10) - the office
 * page and the phone screen.
 *
 * Lucas, 2026-10-10: the operator picks the supplier and the machine (or
 * scans the QR on it), says 开工 or 收工, and takes the photo. Hours go by
 * in/out pairs, not by day or shift; each pair is its own row with full start
 * and end, a 累计工时 column, more filters, and a table that opens on the dates
 * that have records.
 *
 * Rendered to static markup (the runner has no DOM) with the server's answer
 * seeded into the query cache, the way the other screen tests here do it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  EquipmentHoursMachine,
  EquipmentHoursSession,
} from "@/interfaces/equipment-hours";
import messages from "@/messages/zh.json";

const auth = vi.hoisted(() => ({ manage: true, export: true }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: (code: string) =>
      code === "equipment.manage" ? auth.manage : code === "report.export" ? auth.export : true,
  }),
}));

const {
  EquipmentOperatorHours,
  AdjustmentHistory,
  adjustMode,
  adjustmentPayload,
  endTimeLimits,
  keepWithinRange,
  localInputValue,
  projectFilterValue,
  startTimeLimits,
} = await import("@/components/equipment-hours/equipment-operator-hours");
const {
  EquipmentHoursCapture,
  LastSentNote,
  machineLabel,
  matchScannedMachine,
  matchTypedMachine,
  noSupplierNamed,
  nextKind,
  photoTakenAt,
} = await import("@/components/equipment-hours/equipment-hours-capture");
const { machineMatchesSearch } = await import("@/components/equipment-hours/equipment-site-numbers");

const words = messages.equipmentHours;

function render(node: React.ReactNode, seed: (client: QueryClient) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function session(overrides: Partial<EquipmentHoursSession> = {}): EquipmentHoursSession {
  return {
    key: "log-a",
    equipment: "eq-1",
    equipment_name: "Excavator",
    equipment_code: "EQ-001",
    plate: "WXY 1234",
    supplier: "s1",
    supplier_name: "Ace Plant Hire",
    project: "p1",
    project_name: "Hours Tower",
    work_date: "2026-10-07",
    start_at: "2026-10-07T00:00:00Z",
    end_at: "2026-10-07T09:30:00Z",
    photo_end_at: "2026-10-07T09:30:00Z",
    previous_at: null,
    next_at: null,
    hours: "9.50",
    cumulative_hours: "9.50",
    photo_count: 2,
    missing_start: false,
    missing_end: false,
    has_start_photo: true,
    adjusted: false,
    status: "OK",
    photos: [
      { id: "a", kind: "START", captured_at: "2026-10-07T00:00:00Z", operator_name: "Ahmad", watermarked_photo: "/media/a.jpg" },
      { id: "b", kind: "FINISH", captured_at: "2026-10-07T09:30:00Z", operator_name: "Ahmad", watermarked_photo: "/media/b.jpg" },
    ],
    adjustments: [],
    ...overrides,
  };
}

const NO_FILTERS = { project: "", supplier: "", equipment: "", q: "", date_from: "", date_to: "" };

function officePage(answer: Partial<{ date_from: string; date_to: string; automatic_range: boolean }> = {}) {
  return render(<EquipmentOperatorHours />, (client) =>
    client.setQueryData(["equipment-hours", "days", NO_FILTERS], {
      date_from: answer.date_from ?? "2026-09-07",
      date_to: answer.date_to ?? "2026-10-07",
      automatic_range: answer.automatic_range ?? true,
      total_hours: "13.50",
      rows: [
        session(),
        session({
          key: "log-c",
          start_at: "2026-10-07T10:00:00Z",
          end_at: "2026-10-07T14:00:00Z",
          photo_end_at: "2026-10-07T14:00:00Z",
          hours: "4.00",
          cumulative_hours: "13.50",
        }),
        session({
          key: "log-e",
          equipment: "eq-2",
          equipment_name: "Crane",
          equipment_code: "EQ-002",
          plate: "BKL 88",
          supplier_name: "Lift Masters",
          end_at: null,
          photo_end_at: null,
          hours: "0.00",
          cumulative_hours: "13.50",
          photo_count: 1,
          missing_end: true,
          status: "MISSING_END",
          photos: [session().photos[0]],
        }),
      ],
    }),
  );
}

describe("the office page 设备操作员工时", () => {
  it("is titled what the menu calls it, under 设备管理", () => {
    const html = officePage();
    expect(html).toContain(messages.nav.submodule.equipmentOperatorHours);
    const navigation = readFileSync(path.join(process.cwd(), "src/lib/navigation.ts"), "utf8");
    expect(navigation).toMatch(
      /"nav\.submodule\.equipmentOperatorHours",\s*"\/equipment-operator-hours",\s*"equipment",/,
    );
  });

  it("no longer explains a 06:00 shift rule (「不分白天晚上」)", () => {
    for (const language of ["zh", "zh-TW", "en", "ms"]) {
      const catalogue = JSON.parse(
        readFileSync(path.join(process.cwd(), `src/messages/${language}.json`), "utf8"),
      );
      expect(JSON.stringify(catalogue.equipmentHours)).not.toMatch(/06:00|6 点|6 點|夜班|night shift|syif/i);
    }
  });

  it("shows each start-stop as its own row with full start and end, hours and 累计工时 (图7, 图10)", () => {
    const html = officePage();
    // Two pairs of the excavator on one day: two rows, not one stacked day.
    expect(html.match(/>Excavator</g)).toHaveLength(2);
    expect(html).toContain("2026-10-07 08:00");
    expect(html).toContain("2026-10-07 17:30");
    expect(html).not.toContain("次日");
    expect(html).toContain(words.field.cumulative);
    expect(html).toContain("9.50");
    expect(html).toContain("13.50");
    expect(html).toContain("Ace Plant Hire");
    expect(html).toContain("EQ-001");
    expect(html).toContain("/media/a.jpg");
    // The crane has only its start: 0 h and 缺收工, and the office may add the end.
    expect(html).toContain("Crane");
    expect(html).toContain(words.status.MISSING_END);
    expect(html).toContain(words.adjust.add);
  });

  it("filters by supplier, machine, plate or number, project and dates (图11)", () => {
    const html = officePage();
    expect(html).toContain(words.filter.supplier);
    expect(html).toContain(words.filter.equipment);
    expect(html).toContain(words.filter.search);
    expect(html).toContain(words.filter.from);
    expect(html).toContain(words.filter.to);
  });

  it("opens on the dates that have records and says so (图6)", () => {
    const html = officePage();
    expect(html).toContain('value="2026-09-07"');
    expect(html).toContain('value="2026-10-07"');
    expect(html).toContain(
      words.filter.automatic.replace("{from}", "2026-09-07").replace("{to}", "2026-10-07"),
    );
  });

  it("offers the time correction only to someone who may manage equipment", () => {
    auth.manage = false;
    try {
      const html = officePage();
      expect(html).not.toContain(words.adjust.add);
      expect(html).not.toContain(words.adjust.edit);
      expect(html).toContain(words.status.MISSING_END);
    } finally {
      auth.manage = true;
    }
  });

  it("asks for no project when 「全部项目」 is chosen, never for project=all (#6)", () => {
    expect(projectFilterValue("all")).toBe("");
    expect(projectFilterValue("")).toBe("");
    expect(projectFilterValue("p1")).toBe("p1");
    const source = readFileSync(
      path.join(process.cwd(), "src/components/equipment-hours/equipment-operator-hours.tsx"),
      "utf8",
    );
    expect(source).toMatch(/onValueChange=\{\(value\) => setProject\(projectFilterValue\(value\)\)\}/);
  });

  it("shows the export only to someone who may export (#17)", () => {
    expect(officePage()).toContain(messages.common.export);
    auth.export = false;
    try {
      expect(officePage()).not.toContain(messages.common.export);
    } finally {
      auth.export = true;
    }
  });

  it("keeps a range within 92 days by moving the other end (#17)", () => {
    expect(keepWithinRange("2026-01-01", "2026-09-30", "from")).toEqual({
      from: "2026-01-01",
      to: "2026-04-02",
      capped: true,
    });
    expect(keepWithinRange("2026-01-01", "2026-09-30", "to")).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
      capped: true,
    });
    expect(keepWithinRange("2026-09-01", "2026-09-30", "to")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      capped: false,
    });
  });

  it("lets the office end a session before the machine's next photo, at any hour", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const limits = endTimeLimits(
      session({ start_at: "2026-10-06T14:00:00Z", next_at: "2026-10-07T03:00:00Z" }),
      now,
    );
    expect(limits).toEqual({
      min: localInputValue("2026-10-06T14:00:00Z"),
      max: localInputValue("2026-10-07T03:00:00Z"),
    });
    // No next photo: up to now, across midnight and beyond.
    expect(endTimeLimits(session({ next_at: null }), now).max).toBe(localInputValue(now.toISOString()));
  });

  it("asks for the start of a stop photo with no start, and the end otherwise", () => {
    const orphan = session({
      start_at: null,
      has_start_photo: false,
      missing_start: true,
      previous_at: "2026-10-06T10:00:00Z",
      status: "MISSING_START",
    });
    expect(adjustMode(orphan)).toBe("start");
    expect(adjustMode(session())).toBe("end");
    expect(startTimeLimits(orphan)).toEqual({
      min: localInputValue("2026-10-06T10:00:00Z"),
      max: localInputValue("2026-10-07T09:30:00Z"),
    });
    expect(adjustmentPayload(orphan, "start", "2026-10-07T08:00", "  Site diary ")).toEqual({
      session: "log-a",
      start_at: new Date("2026-10-07T08:00").toISOString(),
      reason: "Site diary",
    });
  });

  it("sends the end time in full, named by the session, the reason trimmed", () => {
    expect(adjustmentPayload(session(), "end", "2026-10-07T17:30", "  Operator forgot  ")).toEqual({
      session: "log-a",
      end_at: new Date("2026-10-07T17:30").toISOString(),
      reason: "Operator forgot",
    });
  });

  it("lists every correction newest first, marks the one in use, keeps the stop photo's time", () => {
    const html = render(
      <AdjustmentHistory
        day={session({
          adjusted: true,
          end_at: "2026-10-07T09:00:00Z",
          adjustments: [
            { id: "2", end_at: "2026-10-07T09:00:00Z", reason: "Checked the log book", created_by_name: "Ong", created_at: "2026-10-08T01:00:00Z" },
            { id: "1", end_at: "2026-10-07T10:00:00Z", reason: "Operator forgot", created_by_name: "Ong", created_at: "2026-10-07T12:00:00Z" },
          ],
        })}
      />,
    );
    expect(html.indexOf("Checked the log book")).toBeLessThan(html.indexOf("Operator forgot"));
    expect(html.match(new RegExp(words.history.current, "g"))).toHaveLength(1);
    expect(html).toContain("2026-10-07 17:30");
  });
});

const MACHINES: EquipmentHoursMachine[] = [
  {
    id: "eq-1",
    name: "Excavator",
    code: "EQ-001",
    plate: "WXY 1234",
    serial_no: "SN-77",
    supplier: "s1",
    supplier_name: "Ace Plant Hire",
    project: "p1",
    project_name: "Hours Tower",
    status: "ON_SITE",
    open_since: "2026-10-07T00:00:00Z",
  },
  {
    id: "eq-2",
    name: "Crane",
    code: "EQ-002",
    plate: "BKL 88",
    supplier: "s2",
    supplier_name: "Lift Masters",
    project: "p1",
    project_name: "Hours Tower",
    status: "ON_SITE",
    open_since: null,
  },
];

describe("the phone screen 设备操作员工时", () => {
  it("names a machine by its number, name and plate, never by category", () => {
    expect(machineLabel({ code: "EQ-001", name: "Excavator", plate: "WXY 1234" })).toBe(
      "EQ-001 · Excavator · WXY 1234",
    );
    expect(machineLabel({ name: "Generator", plate: "" })).toBe("Generator");
    const html = render(<EquipmentHoursCapture initialProject="p1" />);
    expect(html).toContain(words.phone.howTo);
    expect(html).toContain(words.phone.pickMachine);
    expect(html).toContain(words.phone.scan);
    expect(html).toContain(words.kind.START);
    expect(html).toContain(words.kind.FINISH);
    expect(html).not.toContain("分类");
  });

  it("always offers the supplier, even with one company's machines", () => {
    const seeded = (rows: EquipmentHoursMachine[]) =>
      render(<EquipmentHoursCapture initialProject="p1" />, (client) =>
        client.setQueryData(["equipment-hours", "machines", "p1"], rows),
      );
    const picker = `aria-label="${words.phone.supplier}"`;
    expect(seeded(MACHINES)).toContain(picker);
    expect(seeded([MACHINES[0]])).toContain(picker);
  });

  it("offers only 「未填供应商」 when no machine names its company", () => {
    expect(noSupplierNamed([{ ...MACHINES[0], supplier: "" }])).toBe(true);
    expect(noSupplierNamed([])).toBe(true);
    expect(noSupplierNamed(MACHINES)).toBe(false);
  });

  it("finds the machine a QR names: id, equipment number, plate or serial, also in a link", () => {
    expect(matchScannedMachine("eq-2", MACHINES)?.name).toBe("Crane");
    expect(matchScannedMachine(" eq001 ", MACHINES)?.name).toBe("Excavator");
    expect(matchScannedMachine("wxy-1234", MACHINES)?.name).toBe("Excavator");
    expect(matchScannedMachine("SN77", MACHINES)?.name).toBe("Excavator");
    expect(matchScannedMachine("https://example.com/machines/EQ-002", MACHINES)?.name).toBe("Crane");
    expect(matchScannedMachine("https://example.com/m?code=EQ-001", MACHINES)?.name).toBe("Excavator");
    expect(matchScannedMachine("NOT-A-MACHINE", MACHINES)).toBeNull();
    expect(matchScannedMachine("", MACHINES)).toBeNull();
  });

  it("offers 收工 first for a machine that is running, 开工 otherwise", () => {
    expect(nextKind(MACHINES[0])).toBe("FINISH");
    expect(nextKind(MACHINES[1])).toBe("START");
    expect(nextKind(undefined)).toBe("START");
  });

  it("is a tile on the phone's 拍照 grid, with the equipment entry's permission", () => {
    const panel = readFileSync(
      path.join(process.cwd(), "src/components/field-staff/field-records-panel.tsx"),
      "utf8",
    );
    expect(panel).toMatch(/key: "operatorHours", permission: "equipment\.capture"/);
    expect(panel).toMatch(/title=\{t\("records\.operatorHours"\)\}/);
    expect(messages.fieldStaffPwa.records.operatorHours).toBe(
      messages.nav.submodule.equipmentOperatorHours,
    );
  });

  it("after a photo, says how the session stands", () => {
    const started = render(
      <LastSentNote
        last={{
          status: "uploaded",
          kind: "START",
          label: "EQ-001 · Excavator",
          session: session({ end_at: null, photo_end_at: null, hours: "0.00", photo_count: 1, missing_end: true }),
        }}
      />,
    );
    expect(started).toContain("开工 · EQ-001 · Excavator");
    expect(started).toContain("2026-10-07 08:00 开工");
    expect(started).toContain(words.phone.stopHint);

    const stopped = render(
      <LastSentNote last={{ status: "uploaded", kind: "FINISH", label: "Excavator", session: session() }} />,
    );
    expect(stopped).toContain("2026-10-07 08:00 至 2026-10-07 17:30，共 9.50 小时");

    const night = render(
      <LastSentNote
        last={{
          status: "uploaded",
          kind: "FINISH",
          label: "Crane",
          session: session({
            start_at: "2026-10-06T14:00:00Z",
            end_at: "2026-10-06T18:00:00Z",
            hours: "4.00",
          }),
        }}
      />,
    );
    expect(night).toContain("2026-10-06 22:00 至 2026-10-07 02:00，共 4.00 小时");

    const waiting = render(<LastSentNote last={{ status: "queued", kind: "START", label: "Excavator" }} />);
    expect(waiting).toContain(words.phone.queued);
  });

  it("takes the photo's own moment from the camera's file, not the send button (#30)", () => {
    const taken = new File(["x"], "machine.jpg", {
      type: "image/jpeg",
      lastModified: Date.parse("2026-10-07T07:58:00+08:00"),
    });
    expect(photoTakenAt(taken)).toBe("2026-10-06T23:58:00.000Z");
    expect(photoTakenAt(new File(["x"], "x.jpg", { lastModified: 0 }))).toBeUndefined();
  });
});

/**
 * 现场编号 (2026-10-10). The client: 「这里扫码有了，供应商有了，多加一个输入编号
 * 也就是说后台人员给设备起一个名字号码 {12}，现场设备会有很多的。后台设备操作员工时
 * 必须支持这些操作。这些不一定要放红点。」
 */
describe("现场编号: the number the office paints on each machine", () => {
  const NUMBERED: EquipmentHoursMachine[] = [
    { ...MACHINES[0], site_no: "12" },
    // A machine whose equipment number happens to be another's site number:
    // typed, 「12」 is the number painted on the excavator.
    { ...MACHINES[1], code: "12", site_no: "挖机 3" },
  ];

  it("names a numbered machine 「12 · name · plate」 on the phone", () => {
    expect(machineLabel(NUMBERED[0])).toBe("12 · Excavator · WXY 1234");
    expect(machineLabel(MACHINES[1])).toBe("EQ-002 · Crane · BKL 88");
  });

  it("picks the machine by the typed number first, then by number, plate or serial", () => {
    expect(matchTypedMachine("12", NUMBERED)?.name).toBe("Excavator");
    expect(matchTypedMachine(" 12 ", NUMBERED)?.name).toBe("Excavator");
    expect(matchTypedMachine("挖机3", NUMBERED)?.name).toBe("Crane");
    expect(matchTypedMachine("eq-001", NUMBERED)?.name).toBe("Excavator");
    expect(matchTypedMachine("bkl88", NUMBERED)?.name).toBe("Crane");
    expect(matchTypedMachine("sn77", NUMBERED)?.name).toBe("Excavator");
    expect(matchTypedMachine("99", NUMBERED)).toBeNull();
    expect(matchTypedMachine("  ", NUMBERED)).toBeNull();
    expect(matchTypedMachine("--", NUMBERED)).toBeNull();
  });

  it("finds a scanned site number too", () => {
    expect(matchScannedMachine("12", [NUMBERED[0], MACHINES[1]])?.name).toBe("Excavator");
    expect(matchScannedMachine("https://example.com/m?code=12", [NUMBERED[0], MACHINES[1]])?.name).toBe(
      "Excavator",
    );
  });

  it("offers 输入编号 beside the list and 扫码, with no red star on the machine or the supplier", () => {
    const html = render(<EquipmentHoursCapture initialProject="p1" />, (client) =>
      client.setQueryData(["equipment-hours", "machines", "p1"], NUMBERED),
    );
    expect(html).toContain(words.phone.typeNumber);
    expect(html).toContain(words.phone.typeNumberPlaceholder);
    expect(html).toContain(words.phone.scan);
    // One requirement, said once in words instead of a star on each picker.
    expect(html).toContain(words.phone.machineAnyWay);
    const star = (label: string) =>
      new RegExp(`${label}<span class="[^"]*text-destructive[^"]*">\\*</span>`);
    expect(html).not.toMatch(star(words.phone.machine));
    expect(html).not.toMatch(star(words.phone.supplier));
    // The photo is still compulsory and still says so.
    expect(html).toMatch(star(words.phone.photo));
    // Nothing typed yet: no 「找不到这个编号」.
    expect(html).not.toContain(words.phone.typedNoMatch);
  });

  it("shows the site number on the office table and in its export", () => {
    const html = render(<EquipmentOperatorHours />, (client) =>
      client.setQueryData(["equipment-hours", "days", NO_FILTERS], {
        date_from: "2026-10-07",
        date_to: "2026-10-07",
        automatic_range: true,
        total_hours: "9.50",
        rows: [session({ site_no: "Z12" })],
      }),
    );
    expect(html).toContain(words.field.siteNo);
    expect(html).toContain("Z12");
    const source = readFileSync(
      path.join(process.cwd(), "src/components/equipment-hours/equipment-operator-hours.tsx"),
      "utf8",
    );
    expect(source).toContain('{ key: "site_no", label: t("field.siteNo") }');
    expect(source).toContain('site_no_label: t("field.siteNo")');
  });

  it("offers 设备编号管理 only to someone who may manage equipment", () => {
    expect(officePage()).toContain(words.siteNo.open);
    auth.manage = false;
    try {
      expect(officePage()).not.toContain(words.siteNo.open);
    } finally {
      auth.manage = true;
    }
  });

  it("finds a machine in 设备编号管理 by number, name, plate or supplier", () => {
    const [excavator] = NUMBERED;
    expect(machineMatchesSearch(excavator, "12")).toBe(true);
    expect(machineMatchesSearch(excavator, "excav")).toBe(true);
    expect(machineMatchesSearch(excavator, "wxy")).toBe(true);
    expect(machineMatchesSearch(excavator, "ace")).toBe(true);
    expect(machineMatchesSearch(excavator, "")).toBe(true);
    expect(machineMatchesSearch(excavator, "lift")).toBe(false);
  });
});

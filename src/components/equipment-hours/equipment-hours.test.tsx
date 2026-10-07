/**
 * 设备操作员工时 (2026-10 B15, Q8) - the office page and the phone screen.
 *
 * The client's view: the operator snaps a photo of his machine when he starts
 * and when he stops; the office sees each machine's hours per day and per
 * month, and can fix a missing finish time.
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
import type { EquipmentHoursDay } from "@/interfaces/equipment-hours";
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
  adjustmentPayload,
  endTimeLimits,
  keepWithinRange,
  projectFilterValue,
} = await import("@/components/equipment-hours/equipment-operator-hours");
const { EquipmentHoursCapture, LastSentNote, machineLabel, photoTakenAt } = await import(
  "@/components/equipment-hours/equipment-hours-capture"
);

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

function day(overrides: Partial<EquipmentHoursDay> = {}): EquipmentHoursDay {
  return {
    key: "eq-1:2026-10-07",
    equipment: "eq-1",
    equipment_name: "Excavator",
    equipment_code: "EQ-001",
    plate: "WXY 1234",
    project: "p1",
    project_name: "Hours Tower",
    work_date: "2026-10-07",
    start_at: "2026-10-07T00:00:00Z",
    end_at: "2026-10-07T09:30:00Z",
    photo_end_at: "2026-10-07T09:30:00Z",
    hours: "9.50",
    photo_count: 2,
    missing_end: false,
    adjusted: false,
    photos: [
      { id: "a", captured_at: "2026-10-07T00:00:00Z", operator_name: "Ahmad", watermarked_photo: "/media/a.jpg" },
      { id: "b", captured_at: "2026-10-07T09:30:00Z", operator_name: "Ahmad", watermarked_photo: "/media/b.jpg" },
    ],
    adjustments: [],
    ...overrides,
  };
}

function today() {
  const value = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function officePage(answered: { date_from?: string; date_to?: string } = {}) {
  const date = today();
  return render(<EquipmentOperatorHours />, (client) =>
    client.setQueryData(
      ["equipment-hours", "days", { project: "", date_from: date, date_to: date }],
      {
        date_from: answered.date_from ?? date,
        date_to: answered.date_to ?? date,
        rows: [
          day(),
          day({
            key: "eq-2:2026-10-07",
            equipment: "eq-2",
            equipment_name: "Crane",
            plate: "BKL 88",
            end_at: null,
            photo_end_at: null,
            hours: "0.00",
            photo_count: 1,
            missing_end: true,
            photos: [day().photos[0]],
          }),
        ],
      },
    ),
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

  it("shows each machine's day: plate, start, end, hours, photos, and 缺收工", () => {
    const html = officePage();
    expect(html).toContain("Excavator");
    expect(html).toContain("WXY 1234");
    expect(html).toContain("08:00");
    expect(html).toContain("17:30");
    expect(html).toContain("9.50");
    expect(html).toContain("/media/a.jpg");
    // The crane has one photo: 0 h and 缺收工, and the office is asked to add the end.
    expect(html).toContain("Crane");
    expect(html).toContain("0.00");
    expect(html).toContain(words.status.MISSING_END);
    expect(html).toContain(words.adjust.add);
  });

  it("offers the end-time correction only to someone who may manage equipment", () => {
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

  it("keeps a range within 92 days by moving the other end, and says so (#17)", () => {
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

  it("states the range the server actually used when it differs from the one typed (#17)", () => {
    const html = officePage({ date_from: "2026-07-01", date_to: "2026-09-30" });
    expect(html).toContain("2026-07-01");
    expect(html).toContain("2026-09-30");
    expect(officePage()).not.toContain(words.filter.shown.split("{")[0]);
  });

  it("marks a night shift's end on the next morning (Q28)", () => {
    const date = today();
    const html = render(<EquipmentOperatorHours />, (client) =>
      client.setQueryData(
        ["equipment-hours", "days", { project: "", date_from: date, date_to: date }],
        {
          date_from: date,
          date_to: date,
          rows: [
            day({
              work_date: "2026-10-06",
              start_at: "2026-10-06T14:00:00Z",
              end_at: "2026-10-06T18:00:00Z",
              photo_end_at: "2026-10-06T18:00:00Z",
              hours: "4.00",
            }),
          ],
        },
      ),
    );
    expect(html).toContain("22:00");
    expect(html).toContain(words.field.nextDay.replace("{time}", "02:00"));
    expect(html).toContain("4.00");
  });

  it("lets the office end a shift up to 06:00 the next morning, not later (Q28)", () => {
    expect(
      endTimeLimits(day({ work_date: "2026-10-06", start_at: "2026-10-06T14:00:00Z" })),
    ).toEqual({ min: "2026-10-06T22:00", max: "2026-10-07T06:00" });
    expect(endTimeLimits(day({ work_date: "2026-12-31", start_at: "2026-12-31T00:00:00Z" })).max).toBe(
      "2027-01-01T06:00",
    );
  });

  it("sends the end time in full and the reason trimmed", () => {
    expect(adjustmentPayload(day(), "2026-10-07T17:30", "  Operator forgot  ")).toEqual({
      equipment: "eq-1",
      work_date: "2026-10-07",
      end_at: new Date("2026-10-07T17:30").toISOString(),
      reason: "Operator forgot",
    });
  });

  it("lists every correction newest first, marks the one in use, keeps the photo's own end", () => {
    const html = render(
      <AdjustmentHistory
        day={day({
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
    expect(html).toContain("17:30");
  });
});

describe("the phone screen 设备操作员工时", () => {
  it("names a machine by name and plate, never by category", () => {
    expect(machineLabel({ name: "Excavator", plate: "WXY 1234" })).toBe("Excavator · WXY 1234");
    expect(machineLabel({ name: "Generator", plate: "" })).toBe("Generator");
    const html = render(<EquipmentHoursCapture initialProject="p1" />);
    expect(html).toContain(words.phone.howTo);
    expect(html).toContain(words.phone.pickMachine);
    expect(html).toContain(words.phone.send);
    expect(html).not.toContain("分类");
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

  it("after a photo, says how the machine's day stands", () => {
    const started = render(
      <LastSentNote
        last={{
          status: "uploaded",
          label: "Excavator · WXY 1234",
          day: day({ end_at: null, photo_end_at: null, hours: "0.00", photo_count: 1, missing_end: true }),
        }}
      />,
    );
    expect(started).toContain("今天 1 张照片，开始 08:00");
    expect(started).toContain(words.phone.stopHint);

    const stopped = render(
      <LastSentNote last={{ status: "uploaded", label: "Excavator", day: day() }} />,
    );
    expect(stopped).toContain("到 17:30 共 9.50 小时");

    const waiting = render(<LastSentNote last={{ status: "queued", label: "Excavator" }} />);
    expect(waiting).toContain(words.phone.queued);
  });

  it("after a photo in the small hours, names the shift that started the evening before (Q28)", () => {
    const night = render(
      <LastSentNote
        last={{
          status: "uploaded",
          label: "Crane",
          day: day({
            work_date: "2026-10-06",
            start_at: "2026-10-06T14:00:00Z",
            end_at: "2026-10-06T18:00:00Z",
            photo_end_at: "2026-10-06T18:00:00Z",
            hours: "4.00",
            photos: [
              { id: "a", captured_at: "2026-10-06T14:00:00Z", operator_name: "Ahmad", watermarked_photo: null },
              { id: "b", captured_at: "2026-10-06T18:00:00Z", operator_name: "Ahmad", watermarked_photo: null },
            ],
          }),
        }}
      />,
    );
    expect(night).not.toContain("今天");
    expect(night).toContain("2026-10-06");
    expect(night).toContain("22:00");
    expect(night).toContain("共 4.00 小时");
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

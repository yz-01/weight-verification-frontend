/**
 * JB192 (客户 11-13 晚上) - the phone's 「Rainy Weather」.
 *
 * > 1. 在现有手机端设置一个「Rainy Weather」按钮。
 * > 2. 开始下雨时，现场人员点击按钮拍第一张照片，系统自动记录日期、时间、GPS、拍摄人
 * >    及所属项目，照片暂存，不立即提交。
 * > 3. 雨停时，再点击同一个按钮拍第二张照片，自动记录雨停时间。
 * > 4. 两张照片完成后一起提交，形成一份完整的雨天记录，系统自动计算本次下雨时长。
 * > 6. 使用现有离线缓存功能，第一张照片即使遇到断网或关闭页面，也不能丢失。
 *
 * Rendered to static markup (the runner has no DOM): each state is drawn from
 * the held record as the phone's store hands it back; the wiring - saved
 * before shown, sent through the queue, deleted once sent - is read in the
 * source.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { HeldRainRecord } from "@/lib/offline-db";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      is_field_staff: true,
      active_project: { project_id: "p-1", project_name: "Site A", company_id: "c-1", company_name: "MSE" },
      company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" },
    },
    can: () => true,
  }),
}));

const { RainInProgressMark, RainyWeatherCapture, heldRainQueryKey } = await import(
  "@/components/field-staff/rainy-weather-capture"
);

const words = zh.rainRecords.phone;
const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode, seed: (qc: QueryClient) => void = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const photo = (name: string, capturedAt: string) => ({
  file: { bytes: new ArrayBuffer(4), name, type: "image/jpeg", lastModified: 1 },
  capturedAt,
});

function held(start: string, end?: string): HeldRainRecord {
  return {
    id: "rain:u1:p-1",
    ownerId: "u1",
    project: "p-1",
    projectName: "Site A",
    clientEventId: "rain-1",
    start: photo("start.jpg", start),
    ...(end ? { end: photo("end.jpg", end) } : {}),
    savedAt: start,
  };
}

const seeded = (record: HeldRainRecord | null) => (qc: QueryClient) =>
  qc.setQueryData(heldRainQueryKey("rain:u1:p-1"), record);

describe("the 「Rainy Weather」 tile (JB192-1, JB192-5)", () => {
  it("is on the 拍照 grid with the 工程进度 tile's permission, called as the client calls it", () => {
    const panel = read("src/components/field-staff/field-records-panel.tsx");
    expect(panel).toMatch(/key: "progress", permission: "progress\.manage"/);
    expect(panel).toMatch(/key: "rain", permission: "progress\.manage", icon: CloudRain/);
    expect(panel).toMatch(/mode === "rain"[\s\S]{0,80}title=\{t\("records\.rain"\)\}[\s\S]{0,120}<RainyWeatherCapture initialProject=\{task\?\.project \?\? boundProject\} \/>/);
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.fieldStaffPwa.records.rain).toBe("Rainy Weather");
    }
  });

  it("says 「进行中」 while a rain record is started and not sent - on this project", () => {
    const panel = read("src/components/field-staff/field-records-panel.tsx");
    expect(panel).toMatch(/option\.key === "rain" && user\?\.id \? \(\s*<RainInProgressMark ownerId=\{user\.id\} project=\{boundProject\} \/>/);
    const open = render(<RainInProgressMark ownerId="u1" project="p-1" />, (qc) =>
      qc.setQueryData(["rain-held", "mark", "u1", "p-1"], true),
    );
    expect(text(open)).toBe(words.inProgress);
    const none = render(<RainInProgressMark ownerId="u1" project="p-1" />, (qc) =>
      qc.setQueryData(["rain-held", "mark", "u1", "p-1"], false),
    );
    expect(none).toBe("");
  });

  it("reads the store once when the grid shows, not on every render", () => {
    const screen = read("src/components/field-staff/rainy-weather-capture.tsx");
    const mark = screen.slice(screen.indexOf("export function RainInProgressMark"));
    expect(mark).toMatch(/getHeldRains\(ownerId\)/);
    expect(mark).toMatch(/refetchOnWindowFocus: false/);
    // One account, one project: the account's own records only.
    expect(mark).toMatch(/record\.project === project/);
  });
});

describe("the first photo (JB192-2)", () => {
  it("nothing started: one big button, no time to fill in", () => {
    const html = render(<RainyWeatherCapture initialProject="p-1" />, seeded(null));
    expect(html).toContain(words.startBig);
    expect(html).toContain(words.howTo);
    expect(html).not.toContain(words.submit);
    expect(html).not.toMatch(/type="(time|datetime-local|number)"/);
  });

  it("is saved on the phone the moment the camera hands it over - before it is shown - and not uploaded", () => {
    const screen = read("src/components/field-staff/rainy-weather-capture.tsx");
    // Saved first, then shown from what was saved.
    expect(screen).toMatch(/await putHeldRain\(next\);[\s\S]{0,120}queryClient\.setQueryData\(heldRainQueryKey\(next\.id\), next\)/);
    // As bytes, with the photo's own moment and the GPS fix.
    expect(screen).toMatch(/heldPhoto\(await storeFile\(file\), photoTakenAt\(file\) \?\? new Date\(\)\.toISOString\(\), asFix\(fix\)\)/);
    // The event id is made with the first photo and kept for the submission.
    expect(screen).toMatch(/clientEventId: newClientEventId\("rain"\)/);
    // Taking the first photo sends nothing.
    const takeStart = screen.slice(screen.indexOf("const takeStart"), screen.indexOf("const takeEnd"));
    expect(takeStart).not.toMatch(/submit|api\.|mutate/);
    // Read back from the phone, offline too.
    expect(screen).toMatch(/queryFn: \(\) => getHeldRain\(id\),[\s\S]{0,60}networkMode: "always"/);
  });

  it("shows the photo, 「开始 14:05」 and how long it has rained, from the store", () => {
    const start = new Date(Date.now() - 65 * 60_000).toISOString();
    const html = render(<RainyWeatherCapture initialProject="p-1" />, seeded(held(start)));
    expect(html).toContain('data-slot="rain-waiting"');
    expect(html).toContain(`alt="${words.startPhoto}"`);
    expect(text(html)).toContain("已经下了 1 小时 5 分");
    expect(html).toContain(words.endBig);
    expect(html).toContain(words.held);
    expect(html).toContain(words.cancel);
    expect(html).not.toContain(words.submit);
  });

  it("ticks the elapsed time on a clock, not by reading the store again", () => {
    const screen = read("src/components/field-staff/rainy-weather-capture.tsx");
    expect(screen).toMatch(/window\.setInterval\(\(\) => setNow\(Date\.now\(\)\), CLOCK_MS\)/);
    expect(screen).toMatch(/staleTime: Infinity/);
  });
});

describe("the second photo and 【提交雨天记录】 (JB192-3, JB192-4)", () => {
  it("shows both photos, start, end and the duration worked out, with one big button", () => {
    const html = render(
      <RainyWeatherCapture initialProject="p-1" />,
      seeded(held("2026-11-13T06:05:20Z", "2026-11-13T07:10:05Z")),
    );
    expect(html).toContain(`alt="${words.startPhoto}"`);
    expect(html).toContain(`alt="${words.endPhoto}"`);
    const shown = text(html);
    expect(shown).toContain("14:05");
    expect(shown).toContain("15:10");
    expect(shown).toContain("1 小时 5 分");
    expect(html).toContain(words.submit);
    expect(html).toContain(words.retake);
    expect(html).toContain(words.cancel);
    expect(html).not.toContain(words.long);
  });

  it("reminds past 12 hours, but still lets it go (JB192-4)", () => {
    const html = render(
      <RainyWeatherCapture initialProject="p-1" />,
      seeded(held("2026-11-12T06:00:00Z", "2026-11-12T18:01:00Z")),
    );
    expect(html).toContain(words.long);
    expect(html).toContain(words.submit);
  });

  it("will not send a second photo that is not later than the first, and says to retake it", () => {
    const html = render(
      <RainyWeatherCapture initialProject="p-1" />,
      seeded(held("2026-11-13T06:05:00Z", "2026-11-13T06:05:40Z")),
    );
    expect(html).toContain(words.tooShort);
    expect(html).not.toContain(words.submit);
    expect(html).toContain(words.retake);
  });

  it("sends both through the offline queue, then clears the phone's copy; a refusal keeps it", () => {
    const screen = read("src/components/field-staff/rainy-weather-capture.tsx");
    expect(screen).toMatch(/submitRainRecordOfflineAware\(ownerId, chosen, getOrCreateFieldDeviceId\(\)\)/);
    const success = screen.slice(screen.indexOf("onSuccess: async"), screen.indexOf("onError:"));
    expect(success).toMatch(/await deleteHeldRain\(chosen\.id\)/);
    const failure = screen.slice(screen.indexOf("onError:"), screen.indexOf("const minutes ="));
    expect(failure).not.toMatch(/deleteHeldRain/);
    expect(failure).toMatch(/rainRefusal\(/);
    // A full half hour: no 提交, no 重拍 - only 「取消这一次」.
    expect(screen).toMatch(/!tooShort && \(refusal\?\.canSubmit \?\? true\)/);
    expect(screen).toMatch(/\(refusal\?\.canRetake \?\? true\)/);
  });

  it("asks before 「取消这一次」 drops the photos", () => {
    const screen = read("src/components/field-staff/rainy-weather-capture.tsx");
    expect(screen).toMatch(/onClick=\{\(\) => onAsk\(true\)\}/);
    expect(screen).toMatch(/data-slot="rain-cancel-yes" onClick=\{onConfirm\}/);
    const cancel = screen.slice(screen.indexOf("const cancel = async"), screen.indexOf("const send = useMutation"));
    expect(cancel).toMatch(/await deleteHeldRain\(record\.id\)/);
  });
});

describe("one open record per account and project (JB192-5)", () => {
  it("keys the held record by account and project", () => {
    const screen = read("src/components/field-staff/rainy-weather-capture.tsx");
    expect(screen).toMatch(/const id = ownerId && project \? heldRainId\(ownerId, project\) : ""/);
    // Another project's record is not this one's.
    const other = render(<RainyWeatherCapture initialProject="p-2" />, (qc) => {
      seeded(held("2026-11-13T06:05:00Z"))(qc);
      qc.setQueryData(heldRainQueryKey("rain:u1:p-2"), null);
    });
    expect(other).toContain(words.startBig);
    expect(other).not.toContain(words.endBig);
  });
});

describe("JB192-2, -5: a worker on several projects comes back to the rain in progress", () => {
  it("opens on the project of the record this phone holds - the one saved last", async () => {
    const { openRainProject } = await import("@/components/field-staff/rainy-weather-capture");
    expect(openRainProject(undefined)).toBe("");
    expect(openRainProject([])).toBe("");
    expect(openRainProject([{ project: "p-a", savedAt: "2026-11-13T06:05:00.000Z" }])).toBe("p-a");
    expect(
      openRainProject([
        { project: "p-a", savedAt: "2026-11-13T06:05:00.000Z" },
        { project: "p-b", savedAt: "2026-11-13T09:40:00.000Z" },
      ]),
    ).toBe("p-b");
  });

  it("follows it once, and only when the phone is not bound to a project", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const source = readFileSync(path.resolve(__dirname, "rainy-weather-capture.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(source).toContain("enabled: Boolean(ownerId) && !initialProject,");
    expect(source).toMatch(/if \(!followedHeld && !project && heldProject\) \{\s+setFollowedHeld\(true\);\s+setProject\(heldProject\);/);
  });
});

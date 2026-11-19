/**
 * JB223 (客户 11-19 事项 3, 图 4): 建立整改事项 at a desk.
 *
 * 「顾问在办公室使用电脑后台要求整改，怎么可能到现场拍照？应该调整为：支持上传电脑内已有的
 * 照片。支持粘贴 WhatsApp 照片及截图。支持直接上传 PDF、Word、Excel 整改文件。照片改为选填，
 * 不应强制拍照。顾问即使没有照片，也应该能够发出整改指令。」
 *
 * The runner has no DOM: the box is rendered to static markup, the paste and
 * sorting rules are tested as functions, and the form's wiring is read from
 * its source (as `safety-photos.test.ts` and `phone-form-requires.test.ts` do).
 */
import { readFileSync } from "node:fs";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const state = vi.hoisted(() => ({ mobile: false, toasts: [] as Array<[string, unknown]> }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/components/shared/field-camera", () => ({
  FieldCamera: (props: { label: string }) => <button data-stub="field-camera">{props.label}</button>,
}));

import { AttachmentPicker } from "@/components/shared/attachment-picker";
import {
  canReadClipboardPictures,
  nameScreenshots,
  pastedForTheBox,
  pastedLineKey,
  readClipboardPictures,
  screenshotName,
} from "@/lib/clipboard-pictures";
import {
  OFFICE_HAZARD_FILE_RULE,
  OFFICE_HAZARD_MAX_DOCUMENTS,
  OFFICE_HAZARD_MAX_PHOTOS,
  capOfficeHazardFiles,
  isItemPhoto,
  officeCeilingKey,
  splitOfficeHazardFiles,
} from "@/lib/office-hazard-files";

const png = (name = "IMG_2041.png") => new File(["png"], name, { type: "image/png" });
const jpg = (name = "IMG_2042.jpg") => new File(["jpg"], name, { type: "image/jpeg" });
const pdf = (name = "整改要求.pdf") => new File(["pdf"], name, { type: "application/pdf" });
const xlsx = (name = "整改清单.xlsx") =>
  new File(["xls"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const docx = (name = "整改说明.docx") =>
  new File(["doc"], name, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
const heic = () => new File(["heic"], "IMG_0042.HEIC", { type: "image/heic" });

function html(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={zh}>
      {node}
    </NextIntlClientProvider>,
  );
}

const SAFETY = readFileSync("src/components/site-operations/safety.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const CREATE = SAFETY.slice(SAFETY.indexOf("function SafetyCreateDialog("), SAFETY.indexOf("function HazardCategoryControl("));

beforeEach(() => {
  state.mobile = false;
  state.toasts = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JB223-1 / JB223-3: one box, sorted when it is sent", () => {
  it("sends pictures as the item's photos and PDF / Word / Excel as its files", () => {
    const { photos, attachments } = splitOfficeHazardFiles([png(), pdf(), jpg(), xlsx(), docx()]);
    expect(photos.map((file) => file.name)).toEqual(["IMG_2041.png", "IMG_2042.jpg"]);
    expect(attachments.map((file) => file.name)).toEqual(["整改要求.pdf", "整改清单.xlsx", "整改说明.docx"]);
  });

  it("sends a picture the browser cannot redraw (HEIC) as a file, not a broken photo", () => {
    expect(isItemPhoto(heic())).toBe(false);
    expect(splitOfficeHazardFiles([heic()]).attachments).toHaveLength(1);
    expect(isItemPhoto({ name: "scan.webp", type: "" })).toBe(true);
  });

  it("keeps ten photos and ten files, and names each one that did not fit", () => {
    const pictures = Array.from({ length: 12 }, (_, at) => png(`p${at}.png`));
    const documents = Array.from({ length: 11 }, (_, at) => pdf(`d${at}.pdf`));
    const capped = capOfficeHazardFiles([...pictures, ...documents]);
    expect(splitOfficeHazardFiles(capped.files).photos).toHaveLength(OFFICE_HAZARD_MAX_PHOTOS);
    expect(splitOfficeHazardFiles(capped.files).attachments).toHaveLength(OFFICE_HAZARD_MAX_DOCUMENTS);
    expect(capped.refused).toEqual([
      { kind: "count", name: "p10.png" },
      { kind: "count", name: "p11.png" },
      { kind: "count", name: "d10.pdf" },
    ]);
    expect(capped.refused.map(officeCeilingKey)).toEqual(["tooManyPhotos", "tooManyPhotos", "tooManyDocuments"]);
    expect(zh.safety.officeCreate.tooManyPhotos).toBe("{name} 没有加入：照片最多 {limit} 张。");
  });

  it("takes pictures, PDF, Word and Excel, 50 MB each", () => {
    expect(OFFICE_HAZARD_FILE_RULE.accept).toBe(".pdf,.doc,.docx,.xls,.xlsx,image/*");
    expect(OFFICE_HAZARD_FILE_RULE.maxBytes).toBe(50 * 1024 * 1024);
    expect(OFFICE_HAZARD_FILE_RULE.multiple).toBe(true);
  });
});

describe("JB223-2: 粘贴 WhatsApp 照片及截图", () => {
  const at = new Date(2026, 10, 19, 14, 5);

  it("names a pasted picture by when it was pasted", () => {
    expect(screenshotName("截图", at, 0, "image/png")).toBe("截图 19-11 14:05.png");
    expect(screenshotName("截图", at, 1, "image/jpeg")).toBe("截图 19-11 14:05 (2).jpg");
    const [renamed, kept] = nameScreenshots([png("image.png"), pdf()], "截图", at);
    expect(renamed.name).toBe("截图 19-11 14:05.png");
    expect(renamed.type).toBe("image/png");
    expect(kept.name).toBe("整改要求.pdf");
  });

  it("【粘贴截图】 takes every picture on the clipboard", async () => {
    const clipboard = {
      read: async () => [
        { types: ["text/html"], getType: async () => new Blob(["<b>x</b>"]) },
        { types: ["image/png"], getType: async () => new Blob(["png"], { type: "image/png" }) },
      ],
    };
    const found = await readClipboardPictures(clipboard, "截图", at);
    expect(found.kind).toBe("ok");
    if (found.kind !== "ok") throw new Error("no picture");
    expect(found.files.map((file) => [file.name, file.type])).toEqual([["截图 19-11 14:05.png", "image/png"]]);
  });

  it("says so when the clipboard holds words only, or nothing", async () => {
    const words = { read: async () => [{ types: ["text/plain"], getType: async () => new Blob(["hi"]) }] };
    expect(await readClipboardPictures(words, "截图", at)).toEqual({ kind: "empty" });
    expect(await readClipboardPictures({ read: async () => [] }, "截图", at)).toEqual({ kind: "empty" });
  });

  it("says so when the browser will not let the page read it", async () => {
    const refusing = {
      read: async () => {
        throw new DOMException("Read permission denied.", "NotAllowedError");
      },
    };
    expect(await readClipboardPictures(refusing, "截图", at)).toEqual({ kind: "refused" });
    expect(await readClipboardPictures(undefined, "截图", at)).toEqual({ kind: "refused" });
    expect(canReadClipboardPictures({ clipboard: {} })).toBe(false);
    expect(canReadClipboardPictures({ clipboard: { read: async () => [] } })).toBe(true);
  });

  const transfer = (files: File[], text = "") => ({
    files,
    items: [],
    getData: (format: string) => (format === "text/plain" ? text : ""),
  });
  const textarea = { tagName: "TEXTAREA" };
  const titleInput = { tagName: "INPUT", type: "text" };
  const button = { tagName: "BUTTON" };

  it("Ctrl+V of a picture with the cursor in 说明 adds it to the box", () => {
    expect(pastedForTheBox(textarea, transfer([png("image.png")]), at)).toHaveLength(1);
    expect(pastedForTheBox(button, transfer([png("image.png")]), at)).toHaveLength(1);
    expect(pastedForTheBox(null, transfer([pdf()]), at)).toHaveLength(1);
  });

  it("leaves words pasted into 标题 / 说明 where they were pasted", () => {
    expect(pastedForTheBox(textarea, transfer([], "三楼临边护栏缺失"), at)).toEqual([]);
    expect(pastedForTheBox(titleInput, transfer([], "三楼"), at)).toEqual([]);
    // Cells copied from Excel carry a picture of themselves too: words, in a box for words.
    expect(pastedForTheBox(textarea, transfer([png("image.png")], "A1\tB1"), at)).toEqual([]);
    expect(pastedForTheBox(button, transfer([], "words"), at)).toEqual([]);
  });

  it("says pictures for pictures and files for anything else", () => {
    expect(pastedLineKey([png()])).toBe("pastedPictures");
    expect(pastedLineKey([png(), pdf()])).toBe("pastedFiles");
  });
});

describe("the box on the office form (AttachmentPicker with pasteAnywhere)", () => {
  const box = (extra: Partial<React.ComponentProps<typeof AttachmentPicker>> = {}) =>
    html(
      <AttachmentPicker
        files={[]}
        onChange={() => undefined}
        rule={OFFICE_HAZARD_FILE_RULE}
        pasteAnywhere
        hint={zh.safety.officeCreate.filesHint}
        chooseLabel={zh.safety.officeCreate.chooseFiles}
        cameraLabel={zh.safety.officeCreate.webcam}
        {...extra}
      />,
    );

  it("offers 【选择照片或文件】【粘贴截图】【用电脑摄像头拍照】, in that order", () => {
    vi.stubGlobal("navigator", { clipboard: { read: async () => [] } });
    const out = box();
    // The hint above the buttons names them too: find the buttons by their closing tag.
    const choose = out.indexOf("选择照片或文件</");
    const paste = out.indexOf("粘贴截图</");
    const camera = out.indexOf("用电脑摄像头拍照</");
    expect(choose).toBeGreaterThan(-1);
    expect(paste).toBeGreaterThan(choose);
    expect(camera).toBeGreaterThan(paste);
    expect(out).toContain(zh.safety.officeCreate.filesHint);
    expect(out).toContain('type="file"');
    expect(out).toContain('accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"');
  });

  it("hides 【粘贴截图】 where the browser cannot read pictures; Ctrl+V still works", () => {
    vi.stubGlobal("navigator", {});
    const out = box();
    expect(out).not.toContain("粘贴截图</");
    expect(out).toContain("选择照片或文件");
  });

  it("leaves every other page's picker as it was", () => {
    vi.stubGlobal("navigator", { clipboard: { read: async () => [] } });
    const out = html(<AttachmentPicker files={[]} onChange={() => undefined} rule={OFFICE_HAZARD_FILE_RULE} />);
    expect(out).not.toContain(zh.attachmentPicker.pasteScreenshot);
    expect(out).toContain(zh.attachmentPicker.dropHint);
    const camera = out.indexOf(`${zh.attachmentPicker.takePhoto}</`);
    expect(camera).toBeGreaterThan(-1);
    expect(camera).toBeLessThan(out.indexOf(`${zh.attachmentPicker.chooseFile}</`));
  });

  it("listens for Ctrl+V on the whole window, without taking a paste the box already took", () => {
    const picker = readFileSync("src/components/shared/attachment-picker.tsx", "utf8");
    expect(picker).toContain('window.addEventListener("paste"');
    expect(picker).toContain("event.defaultPrevented");
    expect(picker).toContain("pastedForTheBox(");
    expect(picker).toMatch(/role="status"/);
  });
});

describe("JB223-0 / JB223-4: the office form stops being a camera form; photos optional", () => {
  it("draws the four camera tiles on the phone only", () => {
    expect(CREATE).toMatch(/\{fieldMode \? \(\s*<>\s*<FieldWrapper label=\{t\("safety\.field\.photo"\)\} required/);
    expect(CREATE).not.toContain("safety.officeCreate.photoPlace");
    expect(CREATE).not.toContain("progressOffice");
  });

  it("has one optional box 「照片和整改文件」 in the office, with paste", () => {
    expect(CREATE).toContain('label={t("safety.officeCreate.files")} optional={t("common.optional")}');
    const office = CREATE.slice(CREATE.indexOf('label={t("safety.officeCreate.files")}'));
    const picker = office.slice(0, office.indexOf("</FieldWrapper>"));
    expect(picker).toContain("<AttachmentPicker");
    expect(picker).toContain("pasteAnywhere");
    expect(picker).toContain("OFFICE_HAZARD_FILE_RULE");
    expect(picker).toContain("fit={capOfficeHazardFiles}");
    expect(picker).not.toContain("required");
  });

  it("lets the office submit with 项目 / 分类 / 标题 only; the phone still needs its photos", () => {
    const requires = CREATE.slice(CREATE.indexOf("<Button requires={["));
    const office = requires.slice(requires.indexOf(": [["), requires.indexOf("]),"));
    expect(office).toContain('t("safety.field.project")');
    expect(office).toContain('t("safety.field.category")');
    expect(office).toContain('t("safety.field.title")');
    expect(office).not.toContain("photosReady");
    const phone = requires.slice(requires.indexOf("? [["), requires.indexOf(": [["));
    expect(phone).toContain('[photosReady, t("safety.field.photo")]');
    expect(CREATE).toContain("completedPhotos.length >= FIELD_EVIDENCE_PHOTO_COUNT && hasRequiredFieldEvidence(draft.photos)");
  });

  it("sends the box sorted, and says the office's own sentence about files still going up", () => {
    expect(CREATE).toContain("splitOfficeHazardFiles(draft.attachments ?? [])");
    expect(CREATE).toMatch(/submitSafetyIncidentOfflineAware\(user\.id, payload, signOffPin, \{ fromOffice: !fieldMode \}\)/);
  });
});

describe("the words, in all four languages", () => {
  const catalogues = { zh, "zh-TW": zhTW, en, ms } as const;

  it("has every new sentence in zh, zh-TW, en and ms", () => {
    for (const [name, catalogue] of Object.entries(catalogues)) {
      const office = catalogue.safety.officeCreate as Record<string, string>;
      for (const key of ["files", "filesHint", "chooseFiles", "webcam", "limits", "attached", "tooManyPhotos", "tooManyDocuments"]) {
        expect(typeof office[key], `${name} safety.officeCreate.${key}`).toBe("string");
      }
      const picker = catalogue.attachmentPicker as Record<string, string>;
      for (const key of ["pasteScreenshot", "pastedPictures", "pastedFiles", "clipboardEmpty", "clipboardRefused", "screenshotName"]) {
        expect(typeof picker[key], `${name} attachmentPicker.${key}`).toBe("string");
      }
      expect(typeof (catalogue.offline as Record<string, unknown>).filesFollowOffice, `${name} offline.filesFollowOffice`).toBe("string");
    }
  });

  it("says it in the client's own words in Chinese", () => {
    expect(zh.safety.officeCreate.files).toBe("照片和整改文件");
    expect(zh.safety.officeCreate.chooseFiles).toBe("选择照片或文件");
    expect(zh.attachmentPicker.pasteScreenshot).toBe("粘贴截图");
    expect(zh.safety.officeCreate.webcam).toBe("用电脑摄像头拍照");
    expect(zh.safety.officeCreate.description).not.toContain("附上照片，");
    expect(zh.safety.officeCreate.filesHint).toContain("没有照片也可以建立");
    expect(zh.offline.filesFollowOffice).not.toContain("办公室");
  });

  it("writes zh-TW in traditional characters", () => {
    const office = zhTW.safety.officeCreate as Record<string, string>;
    const picker = zhTW.attachmentPicker as Record<string, string>;
    const all = [...Object.values(office), picker.pasteScreenshot, picker.clipboardEmpty, picker.clipboardRefused].join("");
    expect(all).not.toMatch(/[选择张让贴图这没传电脑摄头读视览单个复]/);
  });
});

describe("the office's sentence when files are still going up", () => {
  it("is not the phone's 「已送到办公室」", async () => {
    vi.resetModules();
    const post = vi.fn(async () => ({ id: "inc-1" }));
    vi.doMock("@/lib/offline-db", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/offline-db")>()),
      getOfflineJobs: async () => [],
      putOfflineJob: async () => undefined,
      deleteOfflineJob: async () => undefined,
      countOfflineJobs: async () => 0,
    }));
    vi.doMock("@/services/api-client", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/services/api-client")>()),
      api: { post },
      toastSuccess: () => undefined,
      toastOutcome: (key: string, values: unknown) => {
        state.toasts.push([key, values]);
      },
      withOfflineProvenance: async <T,>(_createdAt: string, run: () => Promise<T>) => run(),
    }));
    vi.stubGlobal("navigator", { onLine: true });
    const queue = await import("@/services/offline-sync.service");
    const report = () => ({
      project: "p1",
      title: "三楼临边护栏缺失",
      description: "",
      photos: [],
      attachments: [pdf(), xlsx()],
      client_event_id: "jb223-1",
    });
    const followed = () => state.toasts.filter(([key]) => key.startsWith("offline.filesFollow"));
    const office = await queue.submitSafetyIncidentOfflineAware("lily", report(), undefined, { fromOffice: true });
    expect(office.status).toBe("uploaded");
    expect(followed()).toEqual([["offline.filesFollowOffice", { count: 2 }]]);
    state.toasts = [];
    await queue.submitSafetyIncidentOfflineAware("worker", { ...report(), client_event_id: "jb223-2" });
    expect(followed()).toEqual([["offline.filesFollow", { count: 2 }]]);
    vi.doUnmock("@/lib/offline-db");
    vi.doUnmock("@/services/api-client");
  });
});

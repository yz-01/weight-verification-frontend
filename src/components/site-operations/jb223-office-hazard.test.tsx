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

const state = vi.hoisted(() => ({ mobile: false, handheld: false }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/hooks/use-handheld", () => ({ useIsHandheldDevice: () => state.handheld }));
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
import { acceptFiles, matchesAccept, phoneFileAccept } from "@/lib/attachment-picker";
import { isHandheldEnvironment } from "@/lib/field-install";
import {
  OFFICE_HAZARD_ACCEPT,
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
  state.handheld = false;
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
      { kind: "count", name: "p10.png", photo: true },
      { kind: "count", name: "p11.png", photo: true },
      { kind: "count", name: "d10.pdf", photo: false },
    ]);
    expect(capped.refused.map(officeCeilingKey)).toEqual(["tooManyPhotos", "tooManyPhotos", "tooManyDocuments"]);
    expect(zh.safety.officeCreate.tooManyPhotos).toBe("{name} 没有加入：照片最多 {limit} 张。");
  });

  it("F8: a .jfif photo over the ten is told about photos, as it was sorted", () => {
    const jfif = (name: string) => new File(["jpg"], name, { type: "image/jpeg" });
    const pictures = Array.from({ length: 10 }, (_, at) => png(`p${at}.png`));
    const capped = capOfficeHazardFiles([...pictures, jfif("WhatsApp Image.jfif")]);
    expect(capped.refused).toEqual([{ kind: "count", name: "WhatsApp Image.jfif", photo: true }]);
    expect(capped.refused.map(officeCeilingKey)).toEqual(["tooManyPhotos"]);
    // Sorted as a photo by its type, and by its name when the browser gives none.
    expect(isItemPhoto({ name: "WhatsApp Image.jfif", type: "" })).toBe(true);
  });

  it("takes pictures, PDF, Word and Excel, 50 MB each", () => {
    expect(OFFICE_HAZARD_FILE_RULE.accept).toBe(OFFICE_HAZARD_ACCEPT);
    expect(OFFICE_HAZARD_FILE_RULE.maxBytes).toBe(50 * 1024 * 1024);
    expect(OFFICE_HAZARD_FILE_RULE.multiple).toBe(true);
  });
});

describe("F4: the box offers what the server takes, and says what it refuses", () => {
  const named = (name: string, type = "") => new File(["x"], name, { type });

  it("offers PDF, Word, Excel and the pictures the server takes - no image/*", () => {
    expect(OFFICE_HAZARD_ACCEPT).toBe(".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.heic,.heif");
    expect(OFFICE_HAZARD_ACCEPT).not.toContain("image/*");
    for (const name of ["整改要求.pdf", "a.doc", "a.docx", "a.xls", "a.xlsx", "a.JPG", "a.jfif", "a.png", "a.webp", "a.gif", "a.bmp", "IMG_0042.HEIC"]) {
      expect(matchesAccept(named(name), OFFICE_HAZARD_ACCEPT), name).toBe(true);
    }
  });

  it("refuses a scanner's TIFF, an SVG, an AVIF at the box, by name - not after the item exists", () => {
    const offered = [named("scan.tif", "image/tiff"), named("plan.svg", "image/svg+xml"), named("a.avif", "image/avif")];
    const taken = acceptFiles([], offered, OFFICE_HAZARD_FILE_RULE);
    expect(taken.files).toEqual([]);
    expect(taken.refused).toEqual([
      { kind: "type", name: "scan.tif" },
      { kind: "type", name: "plan.svg" },
      { kind: "type", name: "a.avif" },
    ]);
  });

  it("turns an empty file away at once, by name", () => {
    const empty = new File([], "空白.pdf", { type: "application/pdf" });
    const capped = capOfficeHazardFiles([pdf(), empty]);
    expect(capped.files.map((file) => file.name)).toEqual(["整改要求.pdf"]);
    expect(capped.refused).toEqual([{ kind: "empty", name: "空白.pdf" }]);
    expect(zh.attachmentPicker.emptyFile).toContain("{name}");
  });

  it("names the file and what is taken when a kind is refused (the form's own list)", () => {
    const form = SAFETY.slice(SAFETY.indexOf("function SafetyCreateDialog("));
    expect(form).toContain("useAllowedTypeRefusal(OFFICE_HAZARD_ACCEPT)");
    expect(form).toMatch(/: officeTypeRefusal\(item\)/);
  });

  it("the server's refusals read in all four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      const api = catalogue.errors.api as Record<string, string>;
      expect(api.attachment_content_mismatch).toContain("{name}");
      expect(api.attachment_content_mismatch).toContain("{allowed}");
      expect(api.attachment_empty).toContain("{name}");
      expect(api.hazard_photo_unreadable).toContain("{name}");
      expect(api.hazard_too_many_photos).toContain("{limit}");
    }
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

  it("F6: a second paste in the same minute never takes a name already in the box", async () => {
    const inBox = ["截图 19-11 14:05.png"];
    const [second] = nameScreenshots([png("image.png")], "截图", at, inBox);
    expect(second.name).toBe("截图 19-11 14:05 (2).png");
    const [third, fourth] = nameScreenshots([png("image.png"), png("pasted-x.png")], "截图", at, [
      ...inBox,
      second.name,
    ]);
    expect([third.name, fourth.name]).toEqual(["截图 19-11 14:05 (3).png", "截图 19-11 14:05 (4).png"]);
    // 【粘贴截图】 the same way.
    const clipboard = {
      read: async () => [{ types: ["image/png"], getType: async () => new Blob(["png"], { type: "image/png" }) }],
    };
    const found = await readClipboardPictures(clipboard, "截图", at, inBox);
    if (found.kind !== "ok") throw new Error("no picture");
    expect(found.files.map((file) => file.name)).toEqual(["截图 19-11 14:05 (2).png"]);
  });

  it("F6: the picker hands the names already in the box to both ways of pasting", () => {
    const picker = readFileSync("src/components/shared/attachment-picker.tsx", "utf8");
    expect(picker.match(/files\.map\(\(file\) => file\.name\)/g)).toHaveLength(2);
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
    expect(out).toContain(`accept="${OFFICE_HAZARD_ACCEPT}"`);
  });

  // The office form's own words, chosen by what the box shows (F7).
  const officeWords = {
    hint: ({ phone, pasteButton }: { phone: boolean; pasteButton: boolean }) =>
      phone
        ? zh.safety.officeCreate.filesHintPhone
        : pasteButton
          ? zh.safety.officeCreate.filesHint
          : zh.safety.officeCreate.filesHintNoPasteButton,
    chooseLabel: ({ phone }: { phone: boolean }) => (phone ? undefined : zh.safety.officeCreate.chooseFiles),
    cameraLabel: ({ phone }: { phone: boolean }) => (phone ? undefined : zh.safety.officeCreate.webcam),
  };

  it("F3: a narrow or zoomed window on a computer keeps the computer's box", () => {
    vi.stubGlobal("navigator", { clipboard: { read: async () => [] } });
    state.mobile = true; // the window is under 768 px
    state.handheld = false; // the device is a laptop
    const out = box(officeWords);
    expect(out).toContain("粘贴截图</");
    expect(out).toContain("选择照片或文件</");
    expect(out).toContain(`accept="${OFFICE_HAZARD_ACCEPT}"`);
    expect(out).toContain(zh.safety.officeCreate.filesHint);
  });

  it("F3: decides 'phone' by the device: iOS and Android, not a Windows laptop", () => {
    expect(isHandheldEnvironment("android")).toBe(true);
    expect(isHandheldEnvironment("ios-safari")).toBe(true);
    expect(isHandheldEnvironment("ios-in-app")).toBe(true);
    expect(isHandheldEnvironment("desktop-chromium")).toBe(false);
    expect(isHandheldEnvironment("other")).toBe(false);
    const picker = readFileSync("src/components/shared/attachment-picker.tsx", "utf8");
    expect(picker).toContain("const mobile = pasteAnywhere ? handheld : narrow;");
  });

  it("F7: on a phone the box uses the phone's buttons and words - camera first, 「拍照」, documents to choose", () => {
    vi.stubGlobal("navigator", { clipboard: { read: async () => [] } });
    state.handheld = true;
    const out = box(officeWords);
    expect(out).not.toContain("粘贴截图</");
    expect(out).not.toContain("用电脑摄像头拍照");
    expect(out).not.toContain("选择照片或文件</");
    const camera = out.indexOf(`${zh.attachmentPicker.takePhoto}</`);
    const choose = out.indexOf(`${zh.attachmentPicker.chooseFile}</`);
    expect(camera).toBeGreaterThan(-1);
    expect(choose).toBeGreaterThan(camera);
    expect(out).toContain(zh.safety.officeCreate.filesHintPhone);
    expect(out).toContain(`accept="${phoneFileAccept(OFFICE_HAZARD_ACCEPT)}"`);
    expect(phoneFileAccept(OFFICE_HAZARD_ACCEPT)).toBe(".pdf,.doc,.docx,.xls,.xlsx");
  });

  it("F7: where the browser shows no 【粘贴截图】, the hint does not name it", () => {
    vi.stubGlobal("navigator", {});
    const out = box(officeWords);
    expect(out).not.toContain("粘贴截图</");
    expect(out).toContain(zh.safety.officeCreate.filesHintNoPasteButton);
    expect(zh.safety.officeCreate.filesHintNoPasteButton).not.toContain("【粘贴截图】");
    expect(zh.safety.officeCreate.filesHintNoPasteButton).toContain("Ctrl+V");
  });

  it("F2: the small print says the time a photo is recorded under, as it now is", () => {
    vi.stubGlobal("navigator", {});
    const note = "照片记录的时间就是上面的「发生时间」；没有填，就是您建立这个整改事项的时间（不看照片文件自己的日期）。";
    expect(zh.safety.officeCreate.photoTimeNote.replace("{when}", zh.safety.field.occurredAt)).toBe(note);
    const out = box({ note });
    expect(out).toContain(note);
    expect(out).not.toContain(zh.attachmentPicker.copiedNote);
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

  it("sends the box sorted, as the office's (its files inside the item's own request)", () => {
    expect(CREATE).toContain("splitOfficeHazardFiles(draft.attachments ?? [])");
    expect(CREATE).toMatch(/submitSafetyIncidentOfflineAware\(user\.id, payload, signOffPin, \{ fromOffice: !fieldMode \}\)/);
  });
});

describe("F1: while the office's files go up, the window stays and says so", () => {
  it("says 「正在上传 N 个文件，请不要关闭网页…」 and holds 【建立整改事项】 and 【取消】 with that reason", () => {
    expect(zh.safety.officeCreate.uploading).toBe("正在上传 {count} 个文件，请不要关闭网页…");
    expect(CREATE).toContain('t("safety.officeCreate.uploading", { count: officeFileCount })');
    expect(CREATE).toMatch(/\{uploadingLine && \(\s*<p role="status"/);
    expect(CREATE).toContain("disabled={create.isPending} disabledReason={uploadingLine || undefined}");
    expect(CREATE).toContain("onClick={onClose} disabled={uploading} disabledReason={uploadingLine || undefined}");
  });

  it("is not closed by ✕ / Esc / a click outside, and the browser asks before the tab closes", () => {
    expect(CREATE).toContain("onOpenChange={(next) => !next && !uploading && onClose()}");
    expect(CREATE).toContain('window.addEventListener("beforeunload", warn)');
    expect(CREATE).toContain("if (officeFileCount > 0) setUploading(true);");
    expect(CREATE).toContain("onSettled: () => setUploading(false)");
  });

  it("the phone's form never shows it (its files still follow on their own)", () => {
    expect(CREATE).toContain("const officeFileCount = fieldMode ? 0 : (draft.attachments ?? []).length;");
  });
});

describe("F7 / F2: the office box's words are chosen by what it shows", () => {
  it("passes the three hints, the phone's own labels and the time note", () => {
    const office = CREATE.slice(CREATE.indexOf('label={t("safety.officeCreate.files")}'));
    const picker = office.slice(0, office.indexOf("</FieldWrapper>"));
    expect(picker).toContain('"safety.officeCreate.filesHintPhone"');
    expect(picker).toContain('"safety.officeCreate.filesHint"');
    expect(picker).toContain('"safety.officeCreate.filesHintNoPasteButton"');
    expect(picker).toContain('chooseLabel={({ phone }) => (phone ? undefined : t("safety.officeCreate.chooseFiles"))}');
    expect(picker).toContain('cameraLabel={({ phone }) => (phone ? undefined : t("safety.officeCreate.webcam"))}');
    expect(picker).toContain('note={t("safety.officeCreate.photoTimeNote", { when: t("safety.field.occurredAt") })}');
    expect(picker).toContain("disabled={uploading}");
  });
});

describe("the words, in all four languages", () => {
  const catalogues = { zh, "zh-TW": zhTW, en, ms } as const;

  it("has every new sentence in zh, zh-TW, en and ms", () => {
    for (const [name, catalogue] of Object.entries(catalogues)) {
      const office = catalogue.safety.officeCreate as Record<string, string>;
      for (const key of [
        "files", "filesHint", "filesHintNoPasteButton", "filesHintPhone", "photoTimeNote", "chooseFiles", "webcam",
        "limits", "attached", "tooManyPhotos", "tooManyDocuments", "uploading", "created",
      ]) {
        expect(typeof office[key], `${name} safety.officeCreate.${key}`).toBe("string");
      }
      expect(office.photoTimeNote, `${name} photoTimeNote`).toContain("{when}");
      const picker = catalogue.attachmentPicker as Record<string, string>;
      for (const key of ["pasteScreenshot", "pastedPictures", "pastedFiles", "clipboardEmpty", "clipboardRefused", "screenshotName", "emptyFile"]) {
        expect(typeof picker[key], `${name} attachmentPicker.${key}`).toBe("string");
      }
      // F1: no office files are left "going up" after the item any more.
      expect((catalogue.offline as Record<string, unknown>).filesFollowOffice, `${name} offline.filesFollowOffice`).toBeUndefined();
    }
  });

  it("says it in the client's own words in Chinese", () => {
    expect(zh.safety.officeCreate.files).toBe("照片和整改文件");
    expect(zh.safety.officeCreate.chooseFiles).toBe("选择照片或文件");
    expect(zh.attachmentPicker.pasteScreenshot).toBe("粘贴截图");
    expect(zh.safety.officeCreate.webcam).toBe("用电脑摄像头拍照");
    expect(zh.safety.officeCreate.description).not.toContain("附上照片，");
    expect(zh.safety.officeCreate.filesHint).toContain("没有照片也可以建立");
    expect(zh.safety.officeCreate.created).not.toContain("安全事故");
    expect(zh.safety.officeCreate.created).not.toContain("办公室");
  });

  it("writes zh-TW in traditional characters", () => {
    const office = zhTW.safety.officeCreate as Record<string, string>;
    const picker = zhTW.attachmentPicker as Record<string, string>;
    const all = [...Object.values(office), picker.pasteScreenshot, picker.clipboardEmpty, picker.clipboardRefused].join("");
    expect(all).not.toMatch(/[选择张让贴图这没传电脑摄头读视览单个复]/);
  });
});

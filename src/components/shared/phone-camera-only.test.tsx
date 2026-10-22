/**
 * No phone camera app and no gallery for photos on the phone (J45, Lucas
 * 2026-10-22): every photo is taken with the app's own square camera.
 *
 * Rendered to static markup (the runner has no DOM), with the camera stubbed
 * so what it is handed can be called, and the phone/desktop switch set by
 * hand.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

const state = vi.hoisted(() => ({
  mobile: true,
  cameras: [] as Array<{ label: string; onCapture: (file: File) => void; onClear?: () => void; facingMode?: string }>,
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/components/shared/field-camera", () => ({
  FieldCamera: (props: (typeof state.cameras)[number]) => {
    state.cameras.push(props);
    return <div data-stub="field-camera" data-label={props.label} />;
  },
}));

import { AttachmentPicker } from "@/components/shared/attachment-picker";
import { PhotoFileInput } from "@/components/shared/photo-file-input";

function html(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const shot = (name = "mse-site.jpg") => new File(["jpeg"], name, { type: "image/jpeg" });

beforeEach(() => {
  state.mobile = true;
  state.cameras = [];
});

describe("PhotoFileInput", () => {
  it("is the in-app camera on a phone, with no file input at all", () => {
    const out = html(<PhotoFileInput label="照片" files={[]} onChange={() => undefined} />);
    expect(out).toContain('data-stub="field-camera"');
    expect(out).not.toContain('type="file"');
  });

  it("adds each shot to a list, or replaces the one photo", () => {
    const first = shot("a.jpg");
    const onMany = vi.fn();
    html(<PhotoFileInput label="照片" multiple files={[first]} onChange={onMany} />);
    const second = shot("b.jpg");
    state.cameras[0].onCapture(second);
    expect(onMany).toHaveBeenCalledWith([first, second]);
    state.cameras[0].onClear?.();
    expect(onMany).toHaveBeenLastCalledWith([]);

    const onOne = vi.fn();
    html(<PhotoFileInput label="照片" files={[first]} onChange={onOne} />);
    state.cameras[1].onCapture(second);
    expect(onOne).toHaveBeenCalledWith([second]);
  });

  it("opens the front camera for a selfie", () => {
    html(<PhotoFileInput label="照片" facingMode="user" files={[]} onChange={() => undefined} />);
    expect(state.cameras[0].facingMode).toBe("user");
  });

  it("stays the plain file input in the office", () => {
    state.mobile = false;
    const out = html(<PhotoFileInput label="照片" files={[]} onChange={() => undefined} />);
    expect(out).toContain('type="file"');
    expect(out).toContain('accept="image/*"');
    expect(out).not.toContain('data-stub="field-camera"');
  });
});

describe("添加附件 on a phone", () => {
  const rule = { accept: "image/*,application/pdf,.docx", multiple: true };

  it("takes photos with the in-app camera and offers documents only in the chooser", () => {
    const out = html(<AttachmentPicker files={[]} onChange={() => undefined} rule={rule} />);
    expect(state.cameras).toHaveLength(1);
    expect(state.cameras[0].label).toBe(messages.attachmentPicker.takePhoto);
    expect(out).not.toContain("capture=");
    const inputs = out.match(/<input[^>]*type="file"[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain('accept="application/pdf,.docx"');
    expect(inputs[0]).not.toContain("image");
  });

  it("a camera shot goes into the list", () => {
    const onChange = vi.fn();
    html(<AttachmentPicker files={[]} onChange={onChange} rule={rule} />);
    const photo = shot();
    state.cameras[0].onCapture(photo);
    expect(onChange).toHaveBeenCalledWith([photo]);
  });

  it("offers no chooser when the page takes only pictures", () => {
    const out = html(<AttachmentPicker files={[]} onChange={() => undefined} rule={{ accept: "image/*" }} />);
    expect(out).not.toContain('type="file"');
    expect(out).not.toContain(`${messages.attachmentPicker.chooseFile}</button>`);
    expect(out).toContain(messages.attachmentPicker.dropHintPhoneCameraOnly);
    expect(state.cameras).toHaveLength(1);
  });

  it("keeps the office's chooser as it was", () => {
    state.mobile = false;
    const out = html(<AttachmentPicker files={[]} onChange={() => undefined} rule={rule} />);
    expect(out).toContain('accept="image/*,application/pdf,.docx"');
  });
});

describe("nothing on the phone opens the phone's own camera app", () => {
  // The QR scanners' 「从图片识别」 fallback reads a QR code from a picture and
  // keeps nothing; it is the one place left (see the J45 report).
  const ALLOWED = new Set(["supplier-qr-scanner.tsx", "gate-qr-scanner.tsx"]);

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return files(full);
      return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [full] : [];
    });
  }

  it("has no capture= file input outside the QR fallbacks", () => {
    const offenders = files(path.join(process.cwd(), "src"))
      .filter((file) => !ALLOWED.has(path.basename(file)))
      .filter((file) => /\bcapture=["{]/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

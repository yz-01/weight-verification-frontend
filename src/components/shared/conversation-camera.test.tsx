/**
 * A chat photo on the phone is taken with the app's own camera (Lucas, 10-09:
 * 「我发现手机端的聊天室拍照好像不是系统的相机，弄成系统相机拍照」).
 *
 * Every other place the field app takes a photo opens `FieldCamera`: the
 * viewfinder, the photo taken at upload size, and the position it was taken
 * at. The chat composer offered only a file box, so on a phone the photo came
 * from the phone's own camera app instead. The composer is shared by the
 * record chat and the hazard conversation, so this covers both.
 *
 * Rendered to static markup (the runner has no DOM), with the camera, the
 * button and the file box stubbed so what they are handed can be called.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

const state = vi.hoisted(() => ({
  pathname: "/field-staff/hazards",
  camera: null as null | {
    label: string;
    file?: File;
    onCapture: (file: File) => void;
    onClear?: () => void;
  },
  buttons: [] as Array<{ children?: unknown; onClick?: () => void }>,
  fileInputs: [] as Array<{
    accept?: string;
    capture?: "user" | "environment" | boolean;
    onChange?: (event: { target: { files: File[] } }) => void;
  }>,
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

vi.mock("@/components/shared/record-detail-shell", () => ({
  PhotoViewer: () => null,
}));

vi.mock("@/components/shared/field-camera", () => ({
  FieldCamera: (props: NonNullable<typeof state.camera>) => {
    state.camera = props;
    return <div data-stub="field-camera" data-label={props.label} />;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: { children?: React.ReactNode; onClick?: () => void }) => {
    state.buttons.push(props);
    return <button type="button">{props.children}</button>;
  },
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: (typeof state.fileInputs)[number] & { type?: string }) => {
    if (props.type === "file") state.fileInputs.push(props);
    return (
      <input type={props.type} accept={props.accept} {...(props.capture ? { capture: props.capture } : {})} />
    );
  },
}));

const { requestLocation, compressPhoto } = vi.hoisted(() => ({
  requestLocation: vi.fn(async () => ({
    latitude: "3.1390000",
    longitude: "101.6869000",
    accuracy: "8.00",
  })),
  compressPhoto: vi.fn(async (file: File) => file),
}));
vi.mock("@/lib/field-location", () => ({ requestLocation }));
vi.mock("@/lib/photo-compression", () => ({ compressPhoto }));

const { ConversationComposer } = await import("@/components/shared/conversation");

type Props = Parameters<typeof ConversationComposer>[0];

function render(overrides: Partial<Props> = {}) {
  const props: Props = {
    body: "",
    setBody: vi.fn(),
    file: null,
    setFile: vi.fn(),
    limit: 60,
    sending: false,
    onSend: vi.fn(),
    ...overrides,
  };
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <ConversationComposer {...props} />
    </NextIntlClientProvider>,
  );
  return { html, props };
}

/** Press 发送 and wait for the message to leave (compression and position are awaited first). */
async function pressSend(onSend: Props["onSend"]) {
  sendButton()();
  await vi.waitFor(() => expect(onSend).toHaveBeenCalled());
}

function sendButton() {
  const send = state.buttons.find((button) =>
    ([] as unknown[]).concat(button.children).includes(messages.hazard.send),
  );
  if (!send?.onClick) throw new Error("no send button");
  return send.onClick;
}

const shot = new File(["jpeg"], "mse-site.jpg", { type: "image/jpeg" });

beforeEach(() => {
  state.pathname = "/field-staff/hazards";
  state.camera = null;
  state.buttons = [];
  state.fileInputs = [];
  requestLocation.mockClear();
  compressPhoto.mockClear();
});

describe("taking a photo in a chat on the phone", () => {
  it("opens the in-app camera, not the phone's camera app", () => {
    const { html } = render();
    expect(html).toContain('data-stub="field-camera"');
    expect(state.camera?.label).toBe(messages.hazard.takePhoto);
    // Nothing in the composer asks the browser for the system camera.
    expect(html).not.toContain("capture=");
    expect(state.fileInputs.every((input) => !input.capture)).toBe(true);
  });

  it("keeps the file box, so a photo already in the gallery can still be sent", () => {
    render();
    expect(state.fileInputs).toHaveLength(1);
    expect(state.fileInputs[0].accept).toContain("image/*");
  });

  it("a photo the camera takes becomes the message's photo and asks where it was taken", () => {
    const { props } = render();
    state.camera?.onCapture(shot);
    expect(props.setFile).toHaveBeenCalledWith(shot);
    expect(requestLocation).toHaveBeenCalledOnce();
  });

  it("shows the photo waiting to be sent in the camera tile, and clearing it empties the message", () => {
    const { props } = render({ file: shot });
    expect(state.camera?.file).toBe(shot);
    state.camera?.onClear?.();
    expect(props.setFile).toHaveBeenCalledWith(null);
  });

  it("sends the camera photo through the shared compression with where it was taken", async () => {
    const { props } = render({ file: shot });
    state.camera?.onCapture(shot);
    await pressSend(props.onSend);
    expect(compressPhoto).toHaveBeenCalledWith(shot);
    expect(props.onSend).toHaveBeenCalledWith({
      body: "",
      photo: shot,
      latitude: "3.1390000",
      longitude: "101.6869000",
      accuracy_m: "8.00",
    });
  });

  it("a gallery photo is compressed the same way but carries no position", async () => {
    const picked = new File(["png"], "old.png", { type: "image/png" });
    const { props } = render({ file: picked });
    state.fileInputs[0].onChange?.({ target: { files: [picked] } });
    expect(props.setFile).toHaveBeenCalledWith(picked);
    await pressSend(props.onSend);
    expect(compressPhoto).toHaveBeenCalledWith(picked);
    expect(requestLocation).not.toHaveBeenCalled();
    expect(props.onSend).toHaveBeenCalledWith({ body: "", photo: picked });
  });

  it("a document is sent as an attachment, untouched", async () => {
    const pdf = new File(["%PDF"], "permit.pdf", { type: "application/pdf" });
    const { props } = render({ file: pdf });
    await pressSend(props.onSend);
    expect(compressPhoto).not.toHaveBeenCalled();
    expect(props.onSend).toHaveBeenCalledWith({
      body: "",
      attachment: pdf,
      attachment_name: "permit.pdf",
    });
  });
});

describe("the same chat in the office console", () => {
  it("keeps its file box and adds no camera", () => {
    state.pathname = "/safety";
    const { html } = render();
    expect(html).not.toContain('data-stub="field-camera"');
    expect(state.fileInputs).toHaveLength(1);
  });
});

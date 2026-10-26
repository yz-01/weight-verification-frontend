/**
 * JB36 (客户 10-26 事项 11: 「iPhone/Android无法发送沟通」): the recorder asked
 * for WebM outright, which an iPhone before iOS 18.4 cannot make - the
 * recorder threw after the microphone opened, nothing was sent and the
 * microphone stayed on. It now asks for what the phone can make, names the
 * file after it, and the microphone goes off if recording cannot start.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  startVoiceSession,
  voiceExtension,
  voiceMimeType,
  type VoiceMedia,
} from "@/components/shared/conversation";

describe("the voice format (JB36)", () => {
  it("takes WebM where the browser makes it, MP4 on an iPhone that does not", () => {
    expect(voiceMimeType((type) => type.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(voiceMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
    expect(voiceMimeType(() => false)).toBeUndefined();
    expect(voiceMimeType(undefined)).toBeUndefined();
    expect(
      voiceMimeType(() => {
        throw new Error("no");
      }),
    ).toBeUndefined();
  });

  it("names the file after what was recorded", () => {
    expect(voiceExtension("audio/mp4")).toBe("m4a");
    expect(voiceExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(voiceExtension("audio/aac")).toBe("aac");
    expect(voiceExtension("")).toBe("webm");
  });

  it("an iPhone's recording is sent as an .m4a voice note", async () => {
    const track = { stop: vi.fn() };
    const media: VoiceMedia = {
      mimeType: "audio/mp4",
      state: "inactive",
      stream: { getTracks: () => [track] },
      start() {
        this.state = "recording";
        this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/mp4" }) });
      },
      stop() {
        this.state = "inactive";
        this.onstop?.();
      },
      ondataavailable: null,
      onstop: null,
    };
    const session = startVoiceSession(
      media,
      60,
      { tick: vi.fn(), limit: vi.fn(), ended: vi.fn() },
      { every: () => "t", clear: vi.fn() },
    );

    const { file } = await session.stop();

    expect(file?.name).toMatch(/^voice-\d+\.m4a$/);
    expect(file?.type).toBe("audio/mp4");
    expect(track.stop).toHaveBeenCalled();
  });

  it("never asks for WebM outright, and frees the microphone when it cannot record", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/shared/conversation.tsx"),
      "utf8",
    );
    expect(source).not.toContain('new MediaRecorder(stream, { mimeType: "audio/webm" })');
    expect(source).toMatch(/catch \(error\) \{\s*\/\/ Never leave the microphone on[^]*?track\.stop\(\)/);
    expect(source).toContain('t("hazard.recordFailed")');
  });

  it("the keyboard's send key sends, but not while a Chinese word is being typed", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/shared/conversation.tsx"),
      "utf8",
    );
    expect(source).toContain('enterKeyHint="send"');
    expect(source).toContain("event.nativeEvent.isComposing");
  });
});

/**
 * The open conversation rings for somebody else's new message (JB36, 客户 10-26
 * 事项 11: 「开机状态等候信息也无法接收通知声音」), and the bell and the chat
 * never ring twice for one message.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createMessageSounder } from "@/lib/alert-sound";

const message = (id: string, author: string) => ({ id, author });

describe("the message tone (JB36)", () => {
  it("rings once for others' new words, never for the backlog or for my own", async () => {
    const play = vi.fn(async () => true);
    const sounder = createMessageSounder({ play, muted: () => false });

    expect(await sounder.observe([message("1", "guard")], "me")).toBe("none");
    expect(await sounder.observe([message("1", "guard"), message("2", "me")], "me")).toBe("none");
    expect(
      await sounder.observe([message("1", "guard"), message("2", "me"), message("3", "guard"), message("4", "office")], "me"),
    ).toBe("played");
    expect(play).toHaveBeenCalledTimes(1);
    expect(await sounder.observe([message("1", "guard"), message("3", "guard")], "me")).toBe("none");
  });

  it("keeps the person's mute", async () => {
    const play = vi.fn(async () => true);
    const sounder = createMessageSounder({ play, muted: () => true });
    await sounder.observe([], "me");
    expect(await sounder.observe([message("1", "guard")], "me")).toBe("muted");
    expect(play).not.toHaveBeenCalled();
  });

  it("a tone already ringing is the tone: a second ask schedules nothing", async () => {
    const started: number[] = [];
    class FakeContext {
      state = "running";
      currentTime = 5;
      destination = {};
      createGain() {
        return {
          connect: () => undefined,
          gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
        };
      }
      createOscillator() {
        return {
          type: "",
          frequency: { setValueAtTime: () => undefined },
          connect: () => undefined,
          start: (at: number) => started.push(at),
          stop: () => undefined,
        };
      }
      resume() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("window", { AudioContext: FakeContext });
    vi.stubGlobal("navigator", { userActivation: { hasBeenActive: true } });
    vi.resetModules();
    const { playAlertTone } = await import("@/lib/alert-sound");

    expect(await playAlertTone()).toBe(true);
    expect(await playAlertTone()).toBe(true);
    expect(started).toHaveLength(6);
    vi.unstubAllGlobals();
  });

  it("both conversations use it", () => {
    for (const file of [
      "src/components/shared/record-conversation.tsx",
      "src/components/site-operations/hazard-conversation.tsx",
    ]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).toContain("useNewMessageTone(data?.messages, user?.id)");
    }
  });
});

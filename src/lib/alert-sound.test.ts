/**
 * The office's alert tone for new notices (2026-10-09).
 *
 * Lucas: 「手机端的任何申请后台都需要收到通知就对了，然后有 notification 和
 * 声音提示」. The bell's list is re-read by the live stream and by the polled
 * count; whichever brings a notice, it rings once, and a notice already heard
 * never rings again.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createNoticeSounder, playAlertTone } from "@/lib/alert-sound";

function sounder(options: { played?: boolean; muted?: boolean; rings?: (n: { id: string }) => boolean } = {}) {
  const play = vi.fn(async () => options.played ?? true);
  const instance = createNoticeSounder({
    play,
    rings: options.rings ?? (() => true),
    muted: () => options.muted ?? false,
  });
  return { play, instance };
}

const row = (id: string) => ({ id, data: {} });

describe("createNoticeSounder", () => {
  it("rings once for a new notice", async () => {
    const { play, instance } = sounder();
    await instance.observe([row("old")]);
    expect(play).not.toHaveBeenCalled();

    expect(await instance.observe([row("new"), row("old")])).toBe("played");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("never rings again for a notice already seen, whichever refresh brings it", async () => {
    const { play, instance } = sounder();
    await instance.observe([]);
    await instance.observe([row("n1")]); // the live stream
    await instance.observe([row("n1")]); // the polled count moved: same row
    await instance.observe([row("n1")]); // the popover opened
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not ring through the backlog already waiting when the page opened", async () => {
    const { play, instance } = sounder();
    expect(await instance.observe([row("a"), row("b"), row("c")])).toBe("none");
    expect(play).not.toHaveBeenCalled();
  });

  it("waits for the first answer before deciding what the backlog is", async () => {
    const { play, instance } = sounder();
    expect(await instance.observe(undefined)).toBe("none");
    await instance.observe([row("a")]);
    expect(play).not.toHaveBeenCalled();
  });

  it("rings once for several notices arriving together", async () => {
    const { play, instance } = sounder();
    await instance.observe([]);
    await instance.observe([row("x"), row("y"), row("z")]);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the person turned the sound off, and does not ring it later", async () => {
    let muted = true;
    const play = vi.fn(async () => true);
    const instance = createNoticeSounder({ play, rings: () => true, muted: () => muted });
    await instance.observe([]);
    expect(await instance.observe([row("m1")])).toBe("muted");
    muted = false;
    await instance.observe([row("m1")]);
    expect(play).not.toHaveBeenCalled();
  });

  it("says when the browser blocked it, so the bell can offer to turn it on", async () => {
    const { instance } = sounder({ played: false });
    await instance.observe([]);
    expect(await instance.observe([row("b1")])).toBe("blocked");
  });

  it("only rings for the notices the caller says ring (the phone: hazards)", async () => {
    const { play, instance } = sounder({ rings: (n) => n.id.startsWith("hazard") });
    await instance.observe([]);
    expect(await instance.observe([row("news-1")])).toBe("none");
    expect(await instance.observe([row("hazard-1"), row("news-1")])).toBe("played");
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("playAlertTone", () => {
  it("does not try to make a sound in a tab nobody has touched", async () => {
    expect(await playAlertTone()).toBe(false);
  });
});

describe("the tone rings three times (HD11)", () => {
  it("schedules its two notes three times over, with a gap between", async () => {
    const started: number[] = [];
    class FakeContext {
      state = "running";
      currentTime = 10;
      destination = {};
      createGain() {
        return {
          connect: () => undefined,
          gain: {
            setValueAtTime: () => undefined,
            exponentialRampToValueAtTime: () => undefined,
          },
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
    // A fresh copy, so its one audio context is the fake one.
    vi.resetModules();
    const { playAlertTone: play, ALERT_REPEATS, ALERT_REPEAT_GAP_S } = await import(
      "@/lib/alert-sound"
    );

    expect(await play()).toBe(true);
    expect(ALERT_REPEATS).toBe(3);
    expect(started).toHaveLength(6);
    const firsts = [started[0], started[2], started[4]];
    expect(firsts[1] - firsts[0]).toBeCloseTo(ALERT_REPEAT_GAP_S);
    expect(firsts[2] - firsts[1]).toBeCloseTo(ALERT_REPEAT_GAP_S);
    vi.unstubAllGlobals();
  });

  it("rings every new notice on the phone as in the office, not only hazards", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/notifications/notification-button.tsx"),
      "utf8",
    );
    expect(source).toContain("rings: () => true");
    expect(source).not.toContain("wantsAlertSound");
  });
});

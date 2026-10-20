/**
 * A voice note: 「取消」 drops it (J3, Q3-1); the limit sends it (JB3).
 *
 * Before: only 「停止并发送」. At the limit the recorder stopped with nobody
 * waiting for the file and the timer kept running, so a note that reached the
 * cap was lost and the stop button never finished.
 */
import { describe, expect, it, vi } from "vitest";

import { startVoiceSession, type VoiceMedia } from "@/components/shared/conversation";

function fakeMedia() {
  const track = { stop: vi.fn() };
  const media: VoiceMedia & { stopped: number } = {
    state: "inactive",
    stopped: 0,
    stream: { getTracks: () => [track] },
    start() {
      this.state = "recording";
      this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
    },
    stop() {
      this.state = "inactive";
      this.stopped += 1;
      this.onstop?.();
    },
    ondataavailable: null,
    onstop: null,
  };
  return { media, track };
}

function fakeTimers() {
  let run: (() => void) | null = null;
  const cleared = vi.fn();
  return {
    timers: { every: (next: () => void) => ((run = next), "t"), clear: cleared },
    tick: () => run?.(),
    cleared,
  };
}

describe("a voice note (J3, JB3)", () => {
  it("「停止并发送」 hands over the file and how long it ran", async () => {
    const { media, track } = fakeMedia();
    const clock = fakeTimers();
    const ended = vi.fn();
    const session = startVoiceSession(media, 60, { tick: vi.fn(), limit: vi.fn(), ended }, clock.timers);
    clock.tick();
    clock.tick();

    const result = await session.stop();

    expect(result.seconds).toBe(2);
    expect(result.file).toBeInstanceOf(File);
    expect(track.stop).toHaveBeenCalled();
    expect(clock.cleared).toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("「取消」 stops the microphone and sends nothing", () => {
    const { media, track } = fakeMedia();
    const clock = fakeTimers();
    const limit = vi.fn();
    const ended = vi.fn();
    const session = startVoiceSession(media, 60, { tick: vi.fn(), limit, ended }, clock.timers);
    clock.tick();

    session.cancel();

    expect(media.stopped).toBe(1);
    expect(track.stop).toHaveBeenCalled();
    expect(clock.cleared).toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(limit).not.toHaveBeenCalled();
    // Nothing left to finish: a late stop gives nothing either.
    return session.stop().then((late) => expect(late.file).toBeNull());
  });

  it("reaching the limit sends what was said, once", () => {
    const { media } = fakeMedia();
    const clock = fakeTimers();
    const limit = vi.fn();
    const ticks: number[] = [];
    startVoiceSession(media, 3, { tick: (s) => ticks.push(s), limit, ended: vi.fn() }, clock.timers);
    clock.tick();
    clock.tick();
    clock.tick();
    clock.tick();

    expect(limit).toHaveBeenCalledTimes(1);
    expect(limit.mock.calls[0][0].seconds).toBe(3);
    expect(limit.mock.calls[0][0].file).toBeInstanceOf(File);
    expect(media.stopped).toBe(1);
    expect(clock.cleared).toHaveBeenCalled();
  });
});

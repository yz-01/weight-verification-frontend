import { describe, expect, it } from "vitest";

import { remainingAfter, uploadEach } from "@/lib/attachment-batch";

const file = (name: string) => new File(["x"], name);

describe("uploadEach (I40)", () => {
  it("reports which files went up and keeps only the refused one to send again", async () => {
    const sent: string[] = [];
    const result = await uploadEach([file("a.pdf"), file("b.exe"), file("c.pdf")], async (f) => {
      if (f.name.endsWith(".exe")) throw new Error("refused");
      sent.push(f.name);
    });
    expect(sent).toEqual(["a.pdf", "c.pdf"]);
    expect(result.saved.map((f) => f.name)).toEqual(["a.pdf", "c.pdf"]);
    expect(remainingAfter(result).map((f) => f.name)).toEqual(["b.exe"]);
  });

  it("pressing again after a partial failure never sends a saved file twice", async () => {
    const calls: string[] = [];
    let refuse = true;
    const send = async (f: File) => {
      if (f.name === "b.pdf" && refuse) throw new Error("refused");
      calls.push(f.name);
    };
    const first = await uploadEach([file("a.pdf"), file("b.pdf"), file("c.pdf")], send);
    refuse = false;
    await uploadEach(remainingAfter(first), send);
    expect(calls.sort()).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
  });

  it("an all-good batch leaves nothing to send", async () => {
    const result = await uploadEach([file("a.pdf")], async () => undefined);
    expect(remainingAfter(result)).toEqual([]);
  });
});

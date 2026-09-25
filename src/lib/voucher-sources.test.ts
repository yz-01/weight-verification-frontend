import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn(async () => ({ id: "claim" })));
vi.mock("@/services/api-client", () => ({
  api: { post }, download: vi.fn(), toastSuccess: vi.fn(),
}));

import { addSundryPaymentProof } from "@/services/sundry-claim.service";

import {
  carriesFiles,
  imageFilesFrom,
  pickablePhotos,
  voucherPayload,
  type TransferLike,
} from "./voucher-sources";

/**
 * Where a sundry claim's payment voucher can come from (T-399, D-282):
 * a chosen file, a drop, a pasted screenshot, or a photo already sent in the
 * claim's conversation - which is sent as the message id for the server to
 * copy (`add_payment_proof` with `message`).
 */
const image = (name: string, type = "image/png") => new File([name], name, { type });
const item = (file: File) => ({ kind: "file", type: file.type, getAsFile: () => file });
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("which files a paste or drop hands over", () => {
  it("takes the images from `files` and leaves the rest", () => {
    const shot = image("screenshot.png");
    const transfer: TransferLike = { files: [image("notes.pdf", "application/pdf"), shot] };
    expect(imageFilesFrom(transfer)).toEqual([shot]);
  });

  it("falls back to `items` when a browser puts the pasted image only there", () => {
    const shot = image("image.png");
    const text = { kind: "string", type: "text/plain", getAsFile: () => null };
    expect(imageFilesFrom({ files: [], items: [text, item(shot)] })).toEqual([shot]);
  });

  it("does not count the same screenshot twice when both are filled", () => {
    const shot = image("image.png");
    expect(imageFilesFrom({ files: [shot], items: [item(shot)] })).toHaveLength(1);
  });

  it("hands over nothing for text, nothing at all, or a non-image file", () => {
    expect(imageFilesFrom({ files: [], items: [{ kind: "string", type: "text/plain", getAsFile: () => null }] })).toEqual([]);
    expect(imageFilesFrom(null)).toEqual([]);
    const pdf = image("bank.pdf", "application/pdf");
    expect(imageFilesFrom({ files: [pdf] })).toEqual([]);
    // ...and says a file was offered, so the screen can say "images only".
    expect(carriesFiles({ files: [pdf] })).toBe(true);
    expect(carriesFiles({ files: [], items: [{ kind: "string", type: "text/plain", getAsFile: () => null }] })).toBe(false);
  });
});

describe("which conversation messages can be picked", () => {
  const message = (id: string, photo: string | null, watermarked: string | null = null) => ({
    id, author_name: "Aina", sent_at: `2026-09-2${id}T01:00:00Z`, photo, watermarked_photo: watermarked,
  });

  it("only photos, newest first, showing the stamped copy when there is one", () => {
    const photos = pickablePhotos([
      message("1", "/m/1.jpg"),
      message("2", null),
      message("3", "/m/3.jpg", "/m/3-stamped.jpg"),
    ]);
    expect(photos.map((photo) => photo.id)).toEqual(["3", "1"]);
    expect(photos[0].url).toBe("/m/3-stamped.jpg");
    expect(photos[1].url).toBe("/m/1.jpg");
  });

  it("is empty for a conversation with no photos yet", () => {
    expect(pickablePhotos([message("1", null)])).toEqual([]);
    expect(pickablePhotos(undefined)).toEqual([]);
  });
});

describe("what the upload sends", () => {
  beforeEach(() => post.mockClear());
  const sent = () => (post.mock.calls.at(-1) as unknown as [string, FormData]);

  it("a chosen, dropped or pasted file goes as `file`", async () => {
    const shot = image("pasted.png");
    await addSundryPaymentProof("c1", { ...voucherPayload({ source: "file", file: shot }), amount: "12.50" });
    const [url, data] = sent();
    expect(url).toBe("/api/sundry-claims/c1/add_payment_proof/");
    expect((data.get("file") as File).name).toBe("pasted.png");
    expect(data.has("message")).toBe(false);
    expect(data.get("amount")).toBe("12.50");
  });

  it("a conversation photo goes as `message`, never as a re-uploaded file", async () => {
    const photo = { id: "msg-7", url: "/m/7.jpg", author: "Aina", sentAt: "2026-09-26T01:00:00Z" };
    await addSundryPaymentProof("c1", voucherPayload({ source: "chat", photo }));
    const [, data] = sent();
    expect(data.get("message")).toBe("msg-7");
    expect(data.has("file")).toBe(false);
  });
});

describe("the office screen uses one voucher area", () => {
  const office = read("src/components/sundry-claims/sundry-claims-office.tsx");
  const area = read("src/components/sundry-claims/voucher-source.tsx");

  it("mounts it where the file input was, keeping the lock hint and amount", () => {
    expect(office).toMatch(/<FieldWrapper label=\{t\("proofs\.file"\)\} required hint=\{t\("proofs\.lockHint"\)\}>\s*<VoucherSource claimId=\{claim\.id\}/);
    expect(office).toMatch(/label=\{t\("proofs\.amount"\)\}/);
    expect(office).toMatch(/requires=\{\[\[voucher, t\("proofs\.file"\)\]\]\}/);
  });

  it("takes a file, a drop, a paste and a chat pick, and previews before upload", () => {
    expect(area).toMatch(/<Input[\s\S]{0,60}type="file"[\s\S]{0,20}accept="image\/\*"/);
    expect(area).toMatch(/onDrop=\{[\s\S]{0,160}take\(event\.dataTransfer\)/);
    expect(area).toMatch(/onPaste=\{[\s\S]{0,200}take\(event\.clipboardData\)/);
    expect(area).toMatch(/queryKey: recordConversationKey\("SUNDRY_CLAIM", claimId\)/);
    expect(area).toMatch(/onChange\(\{ source: "chat", photo \}\)/);
    expect(area).toMatch(/<img src=\{previewUrl\}/);
    expect(area).toMatch(/t\("chatEmpty"\)/);
  });
});

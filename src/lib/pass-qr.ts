/**
 * 二维码打印大小 (JB214-3b, Lucas 11-16 「把它们真的做出来」; client 11-05 事项 2
 * 「二维码规则：通行证编号前缀、二维码打印大小……由 MSE 管理」): the size MSE
 * set for the company, in pixels of the downloaded PNG. 标准 is the 220 px
 * every pass had before; the visitor and vehicle passes share it.
 */
import type { SiteAccessPass } from "@/interfaces/site-access";

export const PASS_QR_SIZES = { COMPACT: 160, STANDARD: 220, LARGE: 440 } as const;

export function passQrSize(row: Pick<SiteAccessPass, "qr_print_size">): number {
  return PASS_QR_SIZES[row.qr_print_size ?? "STANDARD"] ?? PASS_QR_SIZES.STANDARD;
}

/**
 * The PNG a pass downloads as. 大字打印 puts the pass number under the code,
 * so a card printed for the gate can be read without a phone; the other sizes
 * are the code alone, as before. Black on white in every mode: these are the
 * picture's pixels, not the page's colours.
 */
export function passQrPng(qr: HTMLCanvasElement, row: Pick<SiteAccessPass, "pass_no" | "qr_print_size">): string {
  if ((row.qr_print_size ?? "STANDARD") !== "LARGE") return qr.toDataURL("image/png");
  const band = Math.round(qr.width * 0.18);
  const card = document.createElement("canvas");
  card.width = qr.width;
  card.height = qr.height + band;
  const context = card.getContext("2d");
  if (!context) return qr.toDataURL("image/png");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, card.width, card.height);
  context.drawImage(qr, 0, 0);
  context.fillStyle = "#000000";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `bold ${Math.round(band * 0.5)}px sans-serif`;
  context.fillText(row.pass_no, card.width / 2, qr.height + band / 2, card.width - 16);
  return card.toDataURL("image/png");
}

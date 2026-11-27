/**
 * JB299 (客户 11-28d 事项 2): the 付款凭证 of a 清运结算, the checks the page
 * makes before anything is sent (the server makes them again).
 *
 * 「财务付款后，上传付款凭证及填写付款编号。」 「未上传付款凭证，不允许确认结算
 * 完毕。」 Photos and PDFs only, at most 10 at a time, 50 MB each - the same
 * ceiling as every other attachment.
 */

/** The PIN 补上传付款凭证 asks for on an old 结算完毕 settlement. */
export const DISPOSAL_VOUCHER_PIN_ACTION = "disposal_settlement.voucher";

export const VOUCHER_MAX_FILES = 10;
export const VOUCHER_MAX_BYTES = 50 * 1024 * 1024;
export const VOUCHER_SUFFIXES = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".pdf"] as const;
/** What the file box offers. */
export const VOUCHER_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif,.pdf";

export type VoucherProblem =
  | { key: "wrongType"; name: string }
  | { key: "tooLarge"; name: string }
  | { key: "tooMany"; limit: number }
  | null;

/** Whether one file is a photo or a PDF, by its name. */
export function isVoucherFile(file: Pick<File, "name">): boolean {
  const name = file.name.toLowerCase();
  return VOUCHER_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * The first problem with the chosen files, or null: a file that is not a
 * photo or a PDF, one over 50 MB, more than 10.
 */
export function voucherProblem(files: readonly Pick<File, "name" | "size">[]): VoucherProblem {
  if (files.length > VOUCHER_MAX_FILES) return { key: "tooMany", limit: VOUCHER_MAX_FILES };
  for (const file of files) {
    if (!isVoucherFile(file)) return { key: "wrongType", name: file.name };
    if (file.size > VOUCHER_MAX_BYTES) return { key: "tooLarge", name: file.name };
  }
  return null;
}

/** 「2.4 MB」 / 「850 KB」. */
export function fileSizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Both halves of the payment evidence, as the server checks them. */
export function hasPayment(row: { payment_no?: string; voucher_count?: number; has_payment?: boolean }): boolean {
  if (typeof row.has_payment === "boolean") return row.has_payment;
  return Boolean(row.payment_no?.trim()) && (row.voucher_count ?? 0) > 0;
}

/** The upload can be saved: a number, and files unless the settlement already has some. */
export function paymentReady(paymentNo: string, files: readonly Pick<File, "name" | "size">[], hasVouchers: boolean) {
  return Boolean(paymentNo.trim()) && (files.length > 0 || hasVouchers) && voucherProblem(files) === null;
}

/**
 * Who the 结算单 is sent to: the supplier's own contact, when it is on file.
 * WhatsApp needs a phone, Email an address; with neither, the person types it.
 */
export function supplierRecipient(row: {
  supplier: { name: string };
  supplier_contact?: { person: string; phone: string; email: string };
}): { name: string; company: string; phone: string; email: string } {
  const contact = row.supplier_contact ?? { person: "", phone: "", email: "" };
  return {
    name: contact.person || row.supplier.name,
    company: row.supplier.name,
    phone: contact.phone,
    email: contact.email,
  };
}

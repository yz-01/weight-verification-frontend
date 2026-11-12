/** 打印 · 下载 / 导出 · 发送 / 分享 (JB27). */
export type FileActionType = "PRINT" | "DOWNLOAD" | "SEND";

export const FILE_ACTION_TYPES: readonly FileActionType[] = ["PRINT", "DOWNLOAD", "SEND"];

/** One row of 「操作记录」 - written once, never changed (JB27). */
export interface FileActionRecord {
  id: string;
  created_at: string;
  action: FileActionType;
  actor_name: string;
  actor_account: string;
  project: string | null;
  project_name: string | null;
  subject: string;
  file_name: string;
  record_kind: string;
  record_id: string;
  link: string;
  channel: string;
  report_export: string | null;
  report_file_name: string | null;
  report_type: string | null;
  report_has_file: boolean;
  /** A send's recipient and status (JB65); null on a print or download. */
  share: FileShare | null;
}

/** 「发送方式（WhatsApp／Email／其他）」 (JB64). DOWNLOAD only on a package share from before 10-29. */
export type FileShareMethod = "WHATSAPP" | "EMAIL" | "OTHER" | "DOWNLOAD";

/** The methods the send form offers. */
export const SEND_METHODS = ["WHATSAPP", "EMAIL", "OTHER"] as const;
export type SendMethod = (typeof SEND_METHODS)[number];

/** How a send left MSE Trace: the button pressed (JB178). */
export type FileShareChannel = "whatsapp" | "email" | "share_sheet" | "link" | "download";

/** 已打开分享窗口 / 已确认发送 (客户 10-29 事项 3 第 3 点). */
export type FileShareStatus = "OPENED" | "CONFIRMED";

/** Who a file goes to, typed before the PIN (JB64). */
export interface SendRecipient {
  method: SendMethod;
  recipient_name: string;
  recipient_company: string;
  recipient_contact: string;
}

/** One line of a record's 「发送记录」 (JB65). */
export interface FileShare {
  id: string;
  created_at: string;
  sent_by_name: string;
  method: FileShareMethod;
  recipient_name: string;
  recipient_company: string;
  recipient_contact: string;
  subject: string;
  file_name: string;
  record_kind: string;
  record_id: string;
  /** An evidence package's file: `R2` (round 2), `TRANSCRIPT` (往来记录), or empty (the latest). */
  part: string;
  status: FileShareStatus;
  confirmed_at: string | null;
  confirmed_by_name: string;
  /** The PDF went as a private link in the message (客户 11-08). */
  has_link?: boolean;
  /** JB178: 「分享链接已生成」 - when the link was made; null without a link. */
  link_created_at?: string | null;
  link_expires_at?: string | null;
  /**
   * JB178: the button pressed in MSE Trace, at `created_at` - 「已打开 WhatsApp」,
   * 「已打开电邮」, 「已打开分享窗口」, 「已复制链接」 or 「已下载文件」.
   */
  opened_via?: FileShareChannel;
  /**
   * 「对方已打开」: the recipient's first download through the link. A badge
   * only - the status stays the person's own answer.
   */
  opened_at?: string | null;
  open_count?: number;
}

/** `attach_file`'s answer: the private link's token, until when, and for how many days. */
export interface ShareLink {
  share: FileShare;
  token: string;
  expires_at: string;
  days: number;
}

/** What the recipient's page (`/s/<token>`) shows - nothing else about the send. */
export interface SharedFileInfo {
  /** The wording: 「打开 PDF」 / 「查看照片」 / 「下载文件」. */
  kind: "pdf" | "image" | "file";
  content_type: string;
  file_name: string;
  company_name: string;
  sender_name: string;
  expires_at: string | null;
  expired: boolean;
}

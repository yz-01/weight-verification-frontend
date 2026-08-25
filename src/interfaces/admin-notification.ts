import type { NotificationRow } from "@/interfaces/platform-ops";

export type AdminNotificationCategory =
  | "CONTRACTOR"
  | "RECYCLER"
  | "SAAS"
  | "COMMISSION"
  | "CWE"
  | "SYSTEM";

export interface AdminNotificationRow extends Omit<NotificationRow, "kind"> {
  kind: string;
  recipient: string;
  recipient_name: string;
  recipient_email: string;
  company: string | null;
  company_name: string | null;
  latest_delivery_status: Record<
    string,
    {
      mode: "SIMULATED" | "LIVE" | "NOT_CONFIGURED";
      status: "PENDING" | "SENT" | "FAILED";
      attempted_at: string;
      error: string;
    }
  >;
  is_deleted: boolean;
}

export interface NotificationChannelStatus {
  channel: "IN_APP" | "EMAIL" | "PUSH";
  mode: "SIMULATED" | "LIVE" | "NOT_CONFIGURED";
  sent: number;
  failed: number;
  last_attempt_at: string | null;
}

export interface NotificationDeliveryRecord {
  id: string;
  notification: string;
  notification_title: string;
  recipient_email: string;
  channel: "IN_APP" | "EMAIL" | "PUSH";
  mode: "SIMULATED" | "LIVE" | "NOT_CONFIGURED";
  status: "PENDING" | "SENT" | "FAILED";
  provider_message_id: string;
  error: string;
  attempted_at: string;
  created_at: string;
}

export interface NotificationStatusRecord {
  id: string;
  notification: string;
  notification_title: string;
  recipient_email: string;
  status: "UNREAD" | "READ" | "DELETED";
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  created_at: string;
}

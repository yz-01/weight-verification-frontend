export type PlatformConfigValueType =
  | "STRING"
  | "INTEGER"
  | "BOOLEAN"
  | "JSON"
  | "DECIMAL";

export type PlatformConfigGroup =
  | "basic"
  | "saas"
  | "commission"
  | "cwe"
  | "cctv"
  | "anpr"
  | "qr"
  | "api_gateway"
  | "notifications"
  | "maintenance";

export interface PlatformConfigEntry {
  key: string;
  group: PlatformConfigGroup;
  value_type: PlatformConfigValueType;
  default_value: string;
  value: string;
  typed_value: unknown;
  description: string;
  is_public: boolean;
  is_readonly: boolean;
  is_required: boolean;
  updated_at: string | null;
  platform_value?: string;
  is_overridden?: boolean;
  source?: "COMPANY" | "PLATFORM_DEFAULT" | "RUNTIME";
}

export interface DeploymentCredentialStatus {
  configured: boolean;
  source: "DEPLOYMENT_ENV" | "COMPANY_INTEGRATION";
}

export interface PlatformConfigCatalogue {
  groups: PlatformConfigGroup[];
  configs: PlatformConfigEntry[];
  credentials: {
    api_gateway: DeploymentCredentialStatus;
    email: DeploymentCredentialStatus;
    push: DeploymentCredentialStatus;
  };
  branding: import("@/interfaces/auth").Branding;
}

export interface CompanyPlatformConfigCatalogue extends PlatformConfigCatalogue {
  company: string;
  company_code: string;
  company_name: string;
}

export interface FeatureFlagRow {
  key: string;
  description: string;
  is_enabled: boolean;
  rollout_pct: number;
  enabled_for_companies: string[];
}

/** One platform-wide announcement, as the publish screen edits it. */
export interface Announcement {
  id: string;
  title: string;
  title_zh: string;
  title_zh_tw: string;
  title_ms: string;
  message: string;
  message_zh: string;
  message_zh_tw: string;
  message_ms: string;
  level: AnnouncementLevel;
  audience: AnnouncementAudience;
  publish_from: string;
  publish_until: string | null;
  is_active: boolean;
}

export type AnnouncementLevel = "INFO" | "WARNING" | "CRITICAL" | "MAINTENANCE";

export type AnnouncementAudience =
  | "ALL"
  | "PLATFORM"
  | "CONTRACTOR"
  | "RECYCLER";

export type AnnouncementInput = Omit<Announcement, "id">;

/**
 * What the API answers on publish. `notifications_delivered` is the count that
 * actually reached somebody's notification list — a published announcement
 * that delivered nothing reached nobody.
 */
export interface AnnouncementPublishResult {
  id: string;
  notifications_delivered: number;
}

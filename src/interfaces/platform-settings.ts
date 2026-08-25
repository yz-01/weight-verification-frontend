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

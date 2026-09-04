/** A revocable, expiring, read-only link to one project's data. */
export interface ExternalAccessGrant {
  id: string;
  name: string;
  /** First few characters of the token, so a row can be told apart. */
  token_hint: string;
  project: string | null;
  project_name: string | null;
  project_code: string | null;
  allowed_fields: ExternalAccessField[];
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  is_valid: boolean;
  created_at: string;
  updated_at: string;
}

/** The sections a grant may expose. The backend rejects anything else, and
 *  rejects financial fields outright. */
export type ExternalAccessField =
  | "project"
  | "progress"
  | "weighing"
  | "documents"
  | "evidence";

export interface ExternalAccessGrantInput {
  name: string;
  project: string | null;
  allowed_fields: ExternalAccessField[];
  expires_at: string;
}

/**
 * What creation answers with. `token` and `portal_url` appear **once** — the
 * server keeps only a hash, so a link that is not copied now is unrecoverable.
 */
export interface IssuedExternalAccessGrant extends ExternalAccessGrant {
  token: string;
  portal_url: string;
}

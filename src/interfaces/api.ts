/**
 * The API envelope.
 *
 * Every backend response, success or failure, arrives in one of these two
 * shapes. The client narrows on `success` so a caller never has to guess.
 */

export interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorEnvelope {
  success: false;
  message: string;
  errors: Record<string, string[] | string>;
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/** A page of rows, as every list endpoint returns it. */
export interface Paginated<T> {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: T[];
}

/** The URL state contract every table page reads and writes. */
export interface ListQuery {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  [key: string]: string | number | boolean | undefined;
}

/**
 * A failed request, carrying enough for a form to highlight its own fields.
 *
 * Thrown rather than returned so a caller that forgets to check cannot
 * silently treat a failure as a success.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[] | string>;

  constructor(
    message: string,
    status: number,
    errors: Record<string, string[] | string> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }

  /** First message for a field, for wiring straight into a form error slot. */
  fieldError(field: string): string | undefined {
    const value = this.errors[field];
    if (Array.isArray(value)) return value[0];
    return value;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** A conflict the user can act on, such as removing a role still in use. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isValidation(): boolean {
    return this.status === 400 || this.status === 422;
  }

  /** No response at all: offline, DNS failure, server down. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

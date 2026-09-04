/**
 * One answer to "which build is this?".
 *
 * The version was read in two places with two different fallbacks — `"1.0.0"`
 * under the driver's settings screen and `"0.1.0"` in the field-staff
 * diagnostics payload. With the variable unset, which it is, the same build
 * reported itself as two different versions depending on who was looking. That
 * is worse than having no version at all: it sends whoever is chasing a bug
 * toward a difference that does not exist.
 *
 * The fallback matches `package.json`, so an unconfigured build reports
 * something true rather than something invented.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

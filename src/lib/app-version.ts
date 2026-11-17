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
 * JB211 (Lucas 11-16 「把它们真的做出来」): every API call now says this
 * version (`X-Client-Version`), and 11.2.9 强制更新 turns away a page older
 * than 最低支持版本. So a build reports `package.json`'s own `version`, which
 * `next.config.ts` puts in as `MSE_PACKAGE_VERSION` - and only that: a
 * deployment variable (the old `NEXT_PUBLIC_APP_VERSION`, once listed in
 * `.env.example` as 0.1.0) would freeze every later build at one number and
 * make 强制更新 turn away the newest page. Release habit: bump `package.json` in
 * each deploy PR and record the same number in 版本管理. The last fallback is
 * that same number, for the test runner, which does not read `next.config.ts`.
 */
export const APP_VERSION = process.env.MSE_PACKAGE_VERSION || "0.1.0";

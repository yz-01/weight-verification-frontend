/**
 * How an audit row names what was done and what it was done to (10-28).
 *
 * The server logs codes - `receipt_records_queried`, `archive.confirm`,
 * `SignOffAssistant` - and the words live here, in the message catalogue.
 * Until 10-28 a code without words was turned into English by replacing its
 * underscores (「Receipt records queried」「Archive.confirm」), which a Chinese
 * reader cannot use. Now:
 *
 * - `audit.operation.<code>` words an operation;
 * - a code with a dot is a PIN-signed operation (`core.step_up.ACTIONS`),
 *   worded where the PIN dialog words it, `signOff.action.<code, dots as _>`;
 * - `audit.objectType.<Model>` words what the row is about;
 * - a code with no words shows nothing extra in Chinese or Malay (the row's
 *   action badge and object still say what happened); English readers see
 *   the code made readable, as before.
 */

interface Translate {
  (key: string): string;
  has: (key: string) => boolean;
}

function readable(code: string): string {
  return code
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

export function auditOperationLabel(operation: unknown, t: Translate, locale: string): string | null {
  if (typeof operation !== "string" || !operation.trim()) return null;
  const code = operation.trim();
  if (code.includes(".")) {
    const key = `signOff.action.${code.replaceAll(".", "_")}`;
    if (t.has(key)) return t(key);
  } else {
    const key = `audit.operation.${code}`;
    if (t.has(key)) return t(key);
  }
  return locale === "en" ? readable(code) : null;
}

export function auditObjectTypeLabel(objectType: unknown, t: Translate, locale: string): string | null {
  if (typeof objectType !== "string" || !objectType.trim()) return null;
  const key = `audit.objectType.${objectType.trim()}`;
  if (!objectType.includes(".") && t.has(key)) return t(key);
  return locale === "en" ? objectType : null;
}

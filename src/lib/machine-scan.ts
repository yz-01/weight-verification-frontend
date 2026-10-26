/**
 * Reading a machine's QR code (2026-10 I24, ID59, ID60).
 *
 * The system prints one code per machine since I24: the link
 * `<site>/scan/equipment?equipment=<SiteEquipment.id>` (the back office's
 * 设备清单 → 二维码). Some machines also carry a sticker of their own - a
 * supplier's link, or just the plate or number as text. Every screen that
 * scans a machine reads all of them the same way, the server's way
 * (`contractor_ops.equipment_qr.match_scanned_equipment`):
 *
 * - the text as it is, then a link's `equipment` / `code` / `id` / `machine`
 *   parameter and its last path part;
 * - each tried as the machine's id, then its equipment number, its 现场编号,
 *   its plate and its serial number;
 * - case, spaces and dashes do not count (the plate's own rule).
 */

/** Where a machine's printed QR code points: its scan page. */
export const EQUIPMENT_SCAN_PATH = "/scan/equipment";

/** The link parameters read, in order. */
const LINK_PARAMETERS = ["equipment", "code", "id", "machine"] as const;

/**
 * Letters and digits only, upper case: how a plate or number is compared -
 * the server's `normalised_plate`. Any script's letters count, so a site
 * number such as 「挖机1」 is not squashed to 「1」.
 */
export function squashCode(value: string | undefined | null): string {
  return (value ?? "").toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** The strings a scanned text may name a machine by, in the order tried. */
export function scanCandidates(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  const candidates = [raw];
  try {
    const url = new URL(raw);
    for (const name of LINK_PARAMETERS) {
      const value = url.searchParams.get(name);
      if (value) candidates.push(value);
    }
    const last = url.pathname.split("/").filter(Boolean).at(-1);
    if (last) candidates.push(decodeURIComponent(last));
  } catch {
    // Not a link: the text itself.
  }
  return candidates;
}

/** What a machine can be named by on a sticker, whatever the screen calls it. */
export interface ScanKeys {
  id: string;
  code?: string | null;
  site_no?: string | null;
  plate?: string | null;
  serial_no?: string | null;
}

/**
 * The machine among `machines` that `text` names, or null.
 *
 * `keys` says where each of a screen's own machine rows keeps the five
 * things a code may name - the hours screen calls the plate `plate`, the
 * register `registration_no`.
 */
export function matchScanned<T>(
  text: string,
  machines: readonly T[],
  keys: (machine: T) => ScanKeys,
): T | null {
  const keyed = machines.map((machine) => ({ machine, keys: keys(machine) }));
  for (const candidate of scanCandidates(text)) {
    const byId = keyed.find((entry) => entry.keys.id === candidate);
    if (byId) return byId.machine;
    const key = squashCode(candidate);
    if (!key) continue;
    for (const field of ["code", "site_no", "plate", "serial_no"] as const) {
      const found = keyed.find((entry) => squashCode(entry.keys[field]) === key);
      if (found) return found.machine;
    }
  }
  return null;
}

/**
 * What a number typed on 退场 finds (JB32), read on the phone alone:
 *
 * - `chosen`: a machine that can go out now - on site on this project;
 * - `notOffered`: one of this project's machines, but not one that can go
 *   (not on site);
 * - `ask`: none of this project's machines - the server says whether it is
 *   a machine of another project or nothing it knows.
 */
export function findTyped<T extends { id: string }>(
  text: string,
  machines: readonly T[],
  offered: readonly T[],
  keys: (machine: T) => ScanKeys,
): { kind: "chosen" | "notOffered"; machine: T } | { kind: "ask" } {
  const found = matchScanned(text, machines, keys);
  if (!found) return { kind: "ask" };
  return offered.some((row) => row.id === found.id)
    ? { kind: "chosen", machine: found }
    : { kind: "notOffered", machine: found };
}

/** A register row's keys (`SiteEquipment`, a 我提交过的 row's `machine`). */
export function registerScanKeys(machine: {
  id: string;
  code?: string | null;
  site_no?: string | null;
  registration_no?: string | null;
  serial_no?: string | null;
}): ScanKeys {
  return {
    id: machine.id,
    code: machine.code,
    site_no: machine.site_no,
    plate: machine.registration_no,
    serial_no: machine.serial_no,
  };
}

/** The link a machine's QR code carries, on this site. */
export function equipmentScanLink(origin: string, machineId: string): string {
  return `${origin.replace(/\/+$/, "")}${EQUIPMENT_SCAN_PATH}?equipment=${encodeURIComponent(machineId)}`;
}

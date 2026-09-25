/**
 * What a delivery photographed on site cannot be submitted without (T-401, D-280).
 *
 * Mirrors `SITE_ENTRY_TEXT_FIELDS` and `SITE_ENTRY_SIGNATURES` in the
 * backend's `receiving/views.py` (`site_entry_missing`): the vehicle plate,
 * the delivery order number, and both signatures. The phone always sends its
 * photographs, so every phone delivery is held to it.
 *
 * Only an ENTRY. A return (退场) is not a delivery and has no supplier's
 * docket, and the server does not ask it - demanding the four here would
 * block a return the server would accept. A missing direction counts as an
 * entry, as it does on the server.
 */

export type SiteEntryField =
  | "vehiclePlate"
  | "deliveryNoteNo"
  | "receiverSignature"
  | "supplierSignature";

export const SITE_ENTRY_FIELDS: readonly SiteEntryField[] = [
  "vehiclePlate",
  "deliveryNoteNo",
  "receiverSignature",
  "supplierSignature",
];

export function siteEntryRequired(movementType: string | null | undefined): boolean {
  return (movementType || "ENTRY") === "ENTRY";
}

/** The site-entry fields still missing for this direction, in form order. */
export function missingSiteEntry(
  movementType: string | null | undefined,
  values: {
    vehiclePlate: string;
    deliveryNoteNo: string;
    receiverSignature?: File | null;
    supplierSignature?: File | null;
  },
): SiteEntryField[] {
  if (!siteEntryRequired(movementType)) return [];
  return SITE_ENTRY_FIELDS.filter((field) => {
    const value = values[field];
    return typeof value === "string" ? !value.trim() : !value;
  });
}

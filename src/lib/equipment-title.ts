/**
 * The message key that names the equipment page for what it is showing (B14).
 *
 * The movements list filtered to one direction is 「设备进场」 or 「设备退场」;
 * unfiltered it is the module, 「设备进退场」. The machine register is not a
 * list of movements, so a direction left in the address does not rename it.
 *
 * `null` means "the menu's own name is right" - nothing to override.
 */
export function equipmentDirectionTitleKey(
  direction: string | undefined,
  register: boolean,
): "nav.submodule.equipmentEntry" | "nav.submodule.equipmentExit" | null {
  if (register) return null;
  if (direction === "ENTRY") return "nav.submodule.equipmentEntry";
  if (direction === "EXIT") return "nav.submodule.equipmentExit";
  return null;
}

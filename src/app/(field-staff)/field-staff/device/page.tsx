import { FieldDeviceTools } from "@/components/technical/field-device-tools";

/**
 * The technical page's device half, on a worker's phone. Not in any field
 * menu (Lucas 2026-10-09: 「不显示给现场人员」): a technician types the
 * address on the worker's own phone, where those records and originals are.
 */
export default function FieldDevicePage() {
  return <FieldDeviceTools />;
}

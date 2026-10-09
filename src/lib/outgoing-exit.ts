/**
 * Where 材料出场's 实际退场（双方签名） can be recorded: on the phone only.
 *
 * Lucas, 2026-10-09: 「后台是不应该显示实际退场的，只有手机端可以看得到而已」.
 * The material leaves at the gate, photographed and signed by both sides on a
 * phone, so the office console (the dashboard routes) never offers the step -
 * whatever the signed-in account may do. The office still reads the exit once
 * it is recorded: its photographs, signatures and figures stay on the record.
 *
 * A placement rule, not a permission: the same account sees the button in the
 * field app (`/field-staff`) and not in the office.
 */

/** Whether this page is the field app on the phone rather than the office console. */
export function onFieldApp(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/field-staff" || pathname.startsWith("/field-staff/");
}

/** Whether 实际退场（双方签名） is offered for a return at `status`, on this page. */
export function offersOutgoingExit({
  pathname,
  status,
  canSubmit,
}: {
  pathname: string | null | undefined;
  status: string;
  canSubmit: boolean;
}): boolean {
  return status === "APPROVED" && canSubmit && onFieldApp(pathname);
}

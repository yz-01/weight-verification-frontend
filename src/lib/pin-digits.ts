/** The digits only, at most six: what a PIN box keeps of what was typed. */
export function pinDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

/**
 * Naming what a form is still waiting for.
 *
 * The common shape across this codebase is a submit button disabled by a chain
 * of emptiness checks — `!form.category || !form.name || !form.serial_number`
 * — which is correct and completely silent. The person sees a grey button and
 * has no way to tell which of eight fields is the one still empty. That is the
 * complaint this exists to answer, so the reason names the fields rather than
 * saying the form is incomplete.
 *
 * Give it the same labels the fields themselves carry, so the sentence points
 * at something the reader can see on screen.
 */

/** One requirement: is it satisfied, and what is the field called. */
export type Requirement = readonly [satisfied: unknown, label: string];

/**
 * The labels of every unmet requirement, in the order the fields appear.
 *
 * Returns an empty array when the form is ready, which is what callers test to
 * decide whether the button is disabled at all — so the same list drives both
 * the disabling and the explanation, and the two cannot drift apart.
 */
export function missingFields(requirements: readonly Requirement[]): string[] {
  return requirements
    .filter(([satisfied]) => {
      if (typeof satisfied === "string") return satisfied.trim() === "";
      return !satisfied;
    })
    .map(([, label]) => label);
}

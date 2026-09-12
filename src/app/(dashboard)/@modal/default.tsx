/**
 * What the modal slot renders when the address is not a create or edit route.
 *
 * Without this file Next has nothing to draw in the slot on a hard load of any
 * other page and the whole route 404s, which is the one way this change could
 * have broken pages it never touched.
 */
export default function NoModal() {
  return null;
}

/**
 * What the modal slot renders on a *soft* navigation to any address that is
 * not a create, edit or detail route.
 *
 * `default.tsx` beside this only applies on a hard load. On a client-side
 * navigation Next keeps a parallel slot's previous content when the new
 * address does not match anything in it - which is how a dialog that pushed
 * the list after saving stayed open over the list (Lucas: 「为什么我保存了
 * 不会自动关掉」). A catch-all matches every address, so leaving a dialog for
 * any other screen now empties the slot and closes it.
 */
export default function NoModalOnSoftNavigation() {
  return null;
}

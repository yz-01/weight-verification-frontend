import { redirect } from "next/navigation";

/**
 * The old address of 总部大屏: it is its own page now (`/wall`, JB291 四),
 * outside the office console, so a bookmark still finds it.
 */
export default function HeadquartersWallRedirect() {
  redirect("/wall");
}

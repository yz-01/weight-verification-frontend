import { redirect } from "next/navigation";

/**
 * The root has nothing of its own to show.
 *
 * Send everyone to the dashboard; its layout runs the auth guard and bounces
 * signed-out visitors to the sign-in page. Deciding here instead would mean
 * reading the session on the server, which it does not hold.
 */
export default function RootPage() {
  redirect("/dashboard");
}

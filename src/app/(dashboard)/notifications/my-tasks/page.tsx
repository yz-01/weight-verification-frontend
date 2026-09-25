"use client";

import { Notifications } from "@/components/notifications/notifications";

/**
 * 我的待办 — everything in the office that is waiting on this person (D-207).
 *
 * The same list as the notification centre, narrowed to the cards that ask
 * the reader to do something. Deliberately not a second aggregation: five of
 * the six piles the customer named are already ACTION notifications, and the
 * sixth (Sundry Claim) will be one when it exists. Two sources counting the
 * same work is what produced the "28 waiting" heading above an empty list.
 */
export default function MyTasksPage() {
  return <Notifications card="ACTION" titleKey="notifications.myTasks.title" />;
}

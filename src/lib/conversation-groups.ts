/**
 * How a conversation's messages are laid out as rows (F2, 7/10).
 *
 * The customer's complaint was that a hazard chat on the phone showed one
 * photograph per screen. Part of the fix is smaller pictures; the other part is
 * that a hazard report arrives as several photo-only messages from the same
 * person in the same moment (one per photograph), and each of them used to take
 * a whole card. Those are put side by side under one header instead.
 *
 * A photo joins the row above it only when nothing would be lost by doing so:
 * same sender, sent within {@link GROUP_WINDOW_MS} of the last message in that
 * row, the new message carries nothing but the photo, and the row itself holds
 * no voice note or file (those keep their own card so their order is plain).
 * Every message is still there, in order - this decides only where it is drawn.
 */

/** The fields of a chat message that decide its row. */
export interface GroupableMessage {
  id: string;
  author_name: string;
  body: string;
  photo: string | null;
  watermarked_photo?: string | null;
  audio?: string | null;
  attachment?: string | null;
  sent_at: string;
}

export interface ConversationPhoto {
  /** The message the photo belongs to. */
  id: string;
  /** The stamped copy when there is one, because it is the evidence. */
  url: string;
  author: string;
  sentAt: string;
}

export interface ConversationRow<M extends GroupableMessage> {
  /** The first message: its sender, time, text, voice and file are the row's. */
  lead: M;
  /** Every message in the row, the lead first. */
  messages: M[];
  /** The row's photographs, side by side, in the order they were sent. */
  photos: ConversationPhoto[];
}

/** Two minutes: one report's photographs, not two separate thoughts. */
export const GROUP_WINDOW_MS = 2 * 60 * 1000;

export function photoOf(message: GroupableMessage): ConversationPhoto | null {
  const url = message.watermarked_photo || message.photo;
  return url
    ? { id: message.id, url, author: message.author_name, sentAt: message.sent_at }
    : null;
}

function isPhotoOnly(message: GroupableMessage): boolean {
  return Boolean(photoOf(message)) && !message.body.trim() && !message.audio && !message.attachment;
}

function closeInTime(earlier: string, later: string): boolean {
  const gap = Date.parse(later) - Date.parse(earlier);
  return Number.isFinite(gap) && gap >= 0 && gap <= GROUP_WINDOW_MS;
}

export function groupConversationMessages<M extends GroupableMessage>(
  messages: readonly M[],
): ConversationRow<M>[] {
  const rows: ConversationRow<M>[] = [];
  for (const message of messages) {
    const photo = photoOf(message);
    const previous = rows.at(-1);
    const last = previous?.messages.at(-1);
    if (
      previous &&
      last &&
      photo &&
      isPhotoOnly(message) &&
      previous.photos.length > 0 &&
      previous.lead.author_name === message.author_name &&
      !previous.lead.audio &&
      !previous.lead.attachment &&
      closeInTime(last.sent_at, message.sent_at)
    ) {
      previous.messages.push(message);
      previous.photos.push(photo);
      continue;
    }
    rows.push({ lead: message, messages: [message], photos: photo ? [photo] : [] });
  }
  return rows;
}

/**
 * 「沟通」 on the phone (JB104, 客户 11-05 事项 9 第 4 点): what a row opens and
 * what it says.
 */

import { canDiscuss, type ChatRecordKind } from "@/lib/record-chat";
import type { FieldConversationPreview } from "@/services/field-conversations.service";

/** What the 「沟通」 page has open: a conversation between people, a record's, a hazard's. */
export type TalkTarget =
  | { kind: ChatRecordKind; id: string }
  | { kind: "HAZARD"; id: string };

/**
 * `?chat=<KIND>:<id>` on the 沟通 tab - the link a message notice carries
 * (`/field-staff?tab=talk&chat=DIRECT:<id>`, the JB97 rule) and the address
 * a tapped row writes. Anything else opens the list.
 */
export function parseTalkParam(value: string | null | undefined): TalkTarget | null {
  if (!value) return null;
  const at = value.indexOf(":");
  if (at <= 0) return null;
  const kind = value.slice(0, at);
  const id = value.slice(at + 1);
  if (!id) return null;
  if (kind === "DIRECT") return { kind: "DIRECT", id };
  if (kind === "HAZARD") return { kind: "HAZARD", id };
  return canDiscuss(kind) ? { kind, id } : null;
}

export function talkParam(target: { kind: string; id: string }): string {
  return `${target.kind}:${target.id}`;
}

/** The second line of a row: who said what, or what they sent. */
export function previewKey(
  last: FieldConversationPreview | null,
): "text" | "photo" | "voice" | "file" | "none" {
  if (!last) return "none";
  if (last.body.trim()) return "text";
  if (last.audio) return "voice";
  if (last.attachment) return "file";
  if (last.photo) return "photo";
  return "text";
}

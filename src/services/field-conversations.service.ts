/**
 * 「沟通」 on the phone (JB104, 客户 11-05 事项 9 第 4 点): every conversation
 * of mine, and 找人沟通. The messages themselves go through the record chat
 * (`getRecordConversation` / `postRecordMessage`), kind `DIRECT` for a
 * conversation between people with no record behind it.
 */

import type { PhoneRole } from "@/interfaces/auth";
import { api } from "@/services/api-client";

/** What a row of 「沟通」 opens: a conversation between people, a record's, a hazard's. */
export type FieldConversationKind = "DIRECT" | "HAZARD" | string;

export interface FieldConversationPreview {
  author: string;
  author_name: string;
  body: string;
  photo: boolean;
  audio: boolean;
  attachment: boolean;
  sent_at: string;
}

export interface FieldConversationRow {
  kind: FieldConversationKind;
  id: string;
  /** A record's reference, a hazard's number, or the other people's names. */
  title: string;
  /** The other people of a direct conversation; empty for a record's. */
  people: { id: string; name: string; phone_role: PhoneRole }[];
  project_name: string;
  last: FieldConversationPreview | null;
  last_at: string;
  unread: number;
}

export interface FieldConversations {
  results: FieldConversationRow[];
  unread: number;
}

export interface ChatPerson {
  id: string;
  full_name: string;
  phone_role: PhoneRole;
  same_project: boolean;
  avatar: string | null;
}

/**
 * Under the record chat's key family on purpose: a new message anywhere
 * (`record.*` on the live stream) refreshes the list with the open chat.
 */
export const FIELD_CONVERSATIONS_KEY = ["record-conversation", "field-list"] as const;

export function getFieldConversations(): Promise<FieldConversations> {
  return api.get<FieldConversations>("/api/field-conversations/list_conversations/");
}

/**
 * The number on 沟通's button: asked by every phone every minute, so the
 * server answers it in two queries instead of building the list (review F3).
 */
export const FIELD_TALK_UNREAD_KEY = ["record-conversation", "field-unread"] as const;

export function getFieldTalkUnread(): Promise<{ unread: number }> {
  return api.get<{ unread: number }>("/api/field-conversations/unread_count/");
}

export function getChatPeople(search?: string): Promise<ChatPerson[]> {
  return api.get<ChatPerson[]>(
    "/api/field-conversations/people/",
    search ? { search } : undefined,
  );
}

export function startConversation(
  people: string[],
  title?: string,
): Promise<{ kind: "DIRECT"; id: string; created: boolean }> {
  return api.post("/api/field-conversations/start_conversation/", {
    people,
    ...(title ? { title } : {}),
  });
}

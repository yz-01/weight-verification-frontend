"use client";

/**
 * The conversation hanging off one business record (T-340).
 *
 * One component for six modules — 收货、出场、废料出场、清运、设备、进度 — because
 * the customer's rule for this round is that every module behaves the same way
 * and the thing they must not do is drift apart. It is built from the same
 * pieces the hazard chat uses (`components/shared/conversation`), so what a
 * person sees and how recording behaves is decided in one place.
 *
 * A hazard does not use this: it keeps its own conversation, which *is* the
 * hazard rather than a panel beside it. Pointing a hazard here as well would
 * give it two chat rooms and split its evidence in half.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import {
  ConversationComposer,
  ConversationMessageRow,
  FALLBACK_AUDIO_LIMIT,
  type ComposerPayload,
} from "@/components/shared/conversation";
import {
  FieldDraft,
  useClearDraft,
  useDraftState,
} from "@/components/field-staff/field-draft";
import type { ArchiveRecordKind } from "@/interfaces/contractor-ops";
import {
  getRecordConversation,
  postRecordMessage,
} from "@/services/contractor-ops.service";

export function RecordConversationPanel({
  kind,
  recordId,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
}) {
  return (
    // The draft scope is per record, so a half-typed question on one delivery
    // is not offered back on the next one.
    <FieldDraft scope={`record-conversation:${kind}:${recordId}`}>
      <RecordConversationContent kind={kind} recordId={recordId} />
    </FieldDraft>
  );
}

function RecordConversationContent({
  kind,
  recordId,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [body, setBody] = useDraftState("body", "");
  const [file, setFile] = useDraftState<File | null>("file", null);
  const clearDraft = useClearDraft();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["record-conversation", kind, recordId],
    queryFn: () => getRecordConversation(kind, recordId),
  });

  const limit = data?.audio_seconds_limit ?? FALLBACK_AUDIO_LIMIT;

  const send = useMutation({
    mutationFn: (payload: ComposerPayload) =>
      postRecordMessage(kind, recordId, payload),
    onSuccess: () => {
      setBody("");
      setFile(null);
      clearDraft();
      void queryClient.invalidateQueries({
        queryKey: ["record-conversation", kind, recordId],
      });
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  // Said rather than shown as an empty thread: a conversation that failed to
  // load and one that nobody has started look identical otherwise, and only
  // one of them means "go ahead and ask your question".
  if (isError || !data) {
    return (
      <p role="alert" className="rounded-md border p-4 text-sm text-destructive">
        {t("recordChat.failed")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">
        {t("recordChat.title", { reference: data.reference })}
      </h3>

      <ul className="space-y-2">
        {data.messages.length === 0 && (
          <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {t("recordChat.empty")}
          </li>
        )}
        {data.messages.map((message) => (
          <ConversationMessageRow key={message.id} message={message} />
        ))}
      </ul>

      <ConversationComposer
        body={body}
        setBody={setBody}
        file={file}
        setFile={setFile}
        limit={limit}
        sending={send.isPending}
        onSend={(payload) => send.mutate(payload)}
      />
    </div>
  );
}

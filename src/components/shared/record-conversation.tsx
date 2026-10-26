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
import { useState } from "react";

import {
  ConversationComposer,
  ConversationMessageList,
  FALLBACK_AUDIO_LIMIT,
  type ComposerPayload,
} from "@/components/shared/conversation";
import {
  FieldDraft,
  useClearDraft,
  useDraftState,
} from "@/components/field-staff/field-draft";
import { useAuth } from "@/components/providers/auth-provider";
import { useBellRefreshOnRead } from "@/hooks/use-bell-refresh-on-read";
import { useNewMessageTone } from "@/hooks/use-new-message-tone";
import { ApiError } from "@/interfaces/api";
import { conversationClosedLine, recordConversationKey, type ChatRecordKind } from "@/lib/record-chat";
import {
  getRecordConversation,
  postRecordMessage,
} from "@/services/contractor-ops.service";

export function RecordConversationPanel({
  kind,
  recordId,
}: {
  kind: ChatRecordKind;
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
  kind: ChatRecordKind;
  recordId: string;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [body, setBody] = useDraftState("body", "");
  const [file, setFile] = useDraftState<File | null>("file", null);
  const clearDraft = useClearDraft();
  // 「需要继续整改」 (ID11): never kept in the draft - it is armed for one send.
  const [moreWork, setMoreWork] = useState(false);

  const { data, isLoading, isLoadingError } = useQuery({
    queryKey: recordConversationKey(kind, recordId),
    queryFn: () => getRecordConversation(kind, recordId),
  });
  // Reading the conversation settles this reader's chat notice for it on the
  // server (2026-10-09); the red dot is re-read when it did.
  useBellRefreshOnRead(data);
  // Somebody else's new message rings while the chat is open (JB36).
  const { user } = useAuth();
  useNewMessageTone(data?.messages, user?.id);

  const limit = data?.audio_seconds_limit ?? FALLBACK_AUDIO_LIMIT;

  const send = useMutation({
    mutationFn: ({ payload, sendBack }: { payload: ComposerPayload; sendBack: boolean }) =>
      postRecordMessage(kind, recordId, {
        ...payload,
        ...(sendBack ? { needs_more_work: true } : {}),
      }),
    onSuccess: (_message, { sendBack }) => {
      setBody("");
      setFile(null);
      clearDraft();
      void queryClient.invalidateQueries({
        queryKey: recordConversationKey(kind, recordId),
      });
      if (sendBack) {
        // Back to 待处理: the task lists and its own detail say so now.
        setMoreWork(false);
        void queryClient.invalidateQueries({ queryKey: ["field-tasks"] });
        void queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      }
    },
    // Finished by somebody else while this screen was open (D-278): refetch,
    // so the composer is replaced by the reason instead of refusing again.
    onError: (reason) => {
      if (reason instanceof ApiError && reason.code === "conversation_closed") {
        void queryClient.invalidateQueries({
          queryKey: recordConversationKey(kind, recordId),
        });
      }
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
  if (isLoadingError || !data) {
    return (
      <p role="alert" className="rounded-md border p-4 text-sm text-destructive">
        {t("recordChat.failed")}
      </p>
    );
  }

  const closedLine = conversationClosedLine(data.closed);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">
        {t("recordChat.title", { reference: data.reference })}
      </h3>

      <ConversationMessageList
        messages={data.messages}
        emptyLabel={t("recordChat.empty")}
        reference={data.reference}
      />

      {/* A finished record keeps its whole history and loses only the way to
          add to it - text, voice, photo, file and send all go together, and
          the reason is said (D-278). */}
      {closedLine ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          {t(closedLine)}
        </p>
      ) : (
        <ConversationComposer
          body={body}
          setBody={setBody}
          file={file}
          setFile={setFile}
          limit={limit}
          sending={send.isPending}
          onSend={(payload) =>
            send.mutate({
              payload,
              sendBack: Boolean(data.can_request_more_work) && moreWork,
            })
          }
          moreWork={
            data.can_request_more_work
              ? { on: moreWork, onChange: setMoreWork }
              : undefined
          }
        />
      )}
    </div>
  );
}

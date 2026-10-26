"use client";

/**
 * A hazard's conversation - which is the hazard, not a panel beside it.
 *
 * The customer was explicit that these are one thing, twice: 「上报了之后就会去
 * 到聊天室进行聊天，只是指定的人员而已」 and 「截图2的聊天室其实就是隐患上报结合
 * 一起而已，拍的照片也会发去聊天室，不是分开的」. So the photograph that raised
 * the hazard arrives here as the first message, and this component renders one
 * unbroken history rather than a report with comments underneath it.
 *
 * Four ways to say something, and the fourth is the one that matters most.
 * The customer described their crew as 「不识字」, which means that for some of
 * them the 「或」 in 「文字或语音」 does not hold: without a voice note the
 * rectification conversation is unusable by exactly the people the loop needs
 * in it. Recording is offered first, not last, and the browsers that cannot do
 * it say so rather than showing a button that does nothing (D-094).
 *
 * Used unchanged by the contractor console and the field app. The customer
 * warned that 「这个系统有很多后台所以不代表改一个后台就可以完成闭环」, and one
 * component in two places is the cheapest way to make that warning moot here.
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
import { LoadFailed } from "@/components/shared/page-primitives";
import { useAuth } from "@/components/providers/auth-provider";
import { useBellRefreshOnRead } from "@/hooks/use-bell-refresh-on-read";
import { useNewMessageTone } from "@/hooks/use-new-message-tone";
import {
  getHazardConversation,
  postHazardMessage,
} from "@/services/site-operations.service";
import { FieldDraft, useClearDraft, useDraftState } from "@/components/field-staff/field-draft";

export function HazardConversationPanel({ incidentId }: { incidentId: string }) {
  return <FieldDraft scope={`hazard-conversation:${incidentId}`}>
    <HazardConversationContent incidentId={incidentId} />
  </FieldDraft>;
}

function HazardConversationContent({ incidentId }: { incidentId: string }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [body, setBody] = useDraftState("body", "");
  const [file, setFile] = useDraftState<File | null>("file", null);
  const clearDraft = useClearDraft();
  // 「需要继续整改」 (ID11): never kept in the draft - it is armed for one send.
  const [moreWork, setMoreWork] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["hazard-conversation", incidentId],
    queryFn: () => getHazardConversation(incidentId),
  });
  // Reading the room settles this reader's chat notice; the dot follows.
  useBellRefreshOnRead(data);
  // Somebody else's new message rings while the chat is open (JB36).
  const { user } = useAuth();
  useNewMessageTone(data?.messages, user?.id);

  const limit = data?.audio_seconds_limit ?? FALLBACK_AUDIO_LIMIT;

  const send = useMutation({
    mutationFn: ({ payload, sendBack }: { payload: ComposerPayload; sendBack: boolean }) =>
      postHazardMessage(incidentId, {
        ...payload,
        ...(sendBack ? { needs_more_work: true } : {}),
      }),
    onSuccess: (_message, { sendBack }) => {
      setBody("");
      setFile(null);
      clearDraft();
      void queryClient.invalidateQueries({
        queryKey: ["hazard-conversation", incidentId],
      });
      if (sendBack) {
        // Back to 待处理: the lists and the item's own state say so now.
        setMoreWork(false);
        void queryClient.invalidateQueries({ queryKey: ["safety"] });
        void queryClient.invalidateQueries({ queryKey: ["safety-incident"] });
        void queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      }
    },
  });

  if (isError) {
    return (
      <LoadFailed
        what={t("hazard.what.conversation")}
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="panel-title">{t("hazard.conversationTitle")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("hazard.participants")}:{" "}
          {data.participants
            .map((person) =>
              person.is_responsible
                ? `${person.full_name} (${t("hazard.responsible")})`
                : person.is_reporter
                  ? `${person.full_name} (${t("hazard.reporter")})`
                  : person.full_name,
            )
            .join(" · ")}
        </p>
      </div>

      {/* Both halves of 「什么时候改，需要多少时间」, when they are known. */}
      {data.incident.rectification_duration_hours && (
        <p className="text-xs text-muted-foreground">
          {t("hazard.duration")}:{" "}
          {t("hazard.durationHours", {
            hours: data.incident.rectification_duration_hours,
          })}
        </p>
      )}

      <ConversationMessageList
        messages={data.messages}
        emptyLabel={t("hazard.empty")}
        reference={data.incident.incident_no}
      />

      {/* Archived is readable, not hidden: 「记录全部都要留着」. What closes is
          the ability to add to it, and the reason is said rather than shown as
          a disabled box with no explanation. */}
      {data.is_closed ? (
        <p className="rounded-lg border border-dashed border-panel-border p-3 text-xs text-muted-foreground">
          {t("hazard.closed")}
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

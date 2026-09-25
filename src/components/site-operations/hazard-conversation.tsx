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

import {
  ConversationComposer,
  ConversationMessageRow,
  FALLBACK_AUDIO_LIMIT,
  type ComposerPayload,
} from "@/components/shared/conversation";
import { LoadFailed } from "@/components/shared/page-primitives";
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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["hazard-conversation", incidentId],
    queryFn: () => getHazardConversation(incidentId),
  });

  const limit = data?.audio_seconds_limit ?? FALLBACK_AUDIO_LIMIT;

  const send = useMutation({
    mutationFn: (payload: ComposerPayload) => postHazardMessage(incidentId, payload),
    onSuccess: () => {
      setBody("");
      setFile(null);
      clearDraft();
      void queryClient.invalidateQueries({
        queryKey: ["hazard-conversation", incidentId],
      });
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
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("hazard.conversationTitle")}</h3>
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

      <ul className="space-y-2">
        {data.messages.length === 0 && (
          <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {t("hazard.empty")}
          </li>
        )}
        {data.messages.map((message) => (
          <ConversationMessageRow key={message.id} message={message} />
        ))}
      </ul>

      {/* Archived is readable, not hidden: 「记录全部都要留着」. What closes is
          the ability to add to it, and the reason is said rather than shown as
          a disabled box with no explanation. */}
      {data.is_closed ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
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
          onSend={(payload) => send.mutate(payload)}
        />
      )}
    </div>
  );
}

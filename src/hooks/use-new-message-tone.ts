"use client";

import { useEffect, useRef } from "react";

import {
  createMessageSounder,
  playAlertTone,
  readAlertSoundMuted,
} from "@/lib/alert-sound";

/**
 * The open conversation rings when somebody else says something (JB36).
 *
 * The person's own 「静音」 choice from the bell holds here too.
 */
export function useNewMessageTone(
  messages: readonly { id: string; author?: string | null }[] | undefined,
  me: string | undefined,
): void {
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  const sounder = useRef<ReturnType<typeof createMessageSounder> | null>(null);
  sounder.current ??= createMessageSounder({
    play: playAlertTone,
    muted: () => readAlertSoundMuted(meRef.current),
  });
  useEffect(() => {
    void sounder.current?.observe(messages, meRef.current);
  }, [messages]);
}

"use client";

import { useEffect, useRef, type RefObject } from "react";

import { arrowStep, isTopDialog } from "@/lib/report-book";

/**
 * ← and → while `enabled`: `onStep(-1)` and `onStep(1)`.
 *
 * Not while the reader is typing in a field, not with a modifier held. Given
 * `owner` (a dialog's content), only while that dialog is the one on top: a
 * photograph opened over a daily report takes the arrows for itself (I9).
 */
export function useArrowKeys(
  onStep: (step: -1 | 1) => void,
  { enabled = true, owner }: { enabled?: boolean; owner?: RefObject<Element | null> } = {},
) {
  const latest = useRef(onStep);
  useEffect(() => {
    latest.current = onStep;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const step = arrowStep(event);
      if (step === null) return;
      if (owner && !isTopDialog(owner.current)) return;
      event.preventDefault();
      latest.current(step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, owner]);
}

"use client";

import { createContext, useContext, useState } from "react";

/**
 * Where the back office's task cards live: a strip in the page layout, under
 * the content column, never on top of it (B01 「桌面及手机无内容遮挡」).
 *
 * The cards used to float (`fixed`, bottom right on a desktop, across the
 * bottom on a phone) and sat over whatever was there - the 查看 button in the
 * last column of a table, a form's submit. A floating layer cannot avoid that,
 * because it does not know what is under it. A strip in the layout can: the
 * content column gets shorter by the strip's height and scrolls as before, so
 * every button stays reachable while cards are waiting.
 *
 * The shell renders the slot; the stack, mounted in the top bar with the bell
 * whose list it reads, portals into it. Outside the shell (the phone shells)
 * there is no slot and no stack.
 */
const DockContext = createContext<{
  dock: HTMLElement | null;
  setDock: (element: HTMLElement | null) => void;
} | null>(null);

export function TaskCardDockProvider({ children }: { children: React.ReactNode }) {
  const [dock, setDock] = useState<HTMLElement | null>(null);
  return (
    <DockContext.Provider value={{ dock, setDock }}>{children}</DockContext.Provider>
  );
}

/** The strip itself. Takes no space while there is nothing in it. */
export function TaskCardDockSlot() {
  const context = useContext(DockContext);
  return (
    <div
      ref={context?.setDock}
      data-slot="task-card-dock"
      className="shrink-0 empty:hidden"
    />
  );
}

/** The element the stack renders into, or null where there is none. */
export function useTaskCardDock(): HTMLElement | null {
  return useContext(DockContext)?.dock ?? null;
}

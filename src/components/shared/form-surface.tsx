"use client";

import { createContext, useContext } from "react";

/**
 * Where a form is being drawn: its own page, or a dialog over the list.
 *
 * T-216 turns 28 full-page create and edit routes into dialogs. Every one of
 * them already renders through `FormShell`, so the shell is the one place that
 * has to know which surface it is on - the 28 forms themselves do not change,
 * and cannot drift apart from each other by being converted one at a time.
 *
 * A context rather than a prop because the thing that knows is the intercepted
 * route at the top and the thing that needs to know is the shell far below,
 * with the module's own form component in between. Threading a prop through
 * would mean editing all 28 after all.
 */
export type FormSurface = "page" | "dialog";

const FormSurfaceContext = createContext<FormSurface>("page");

export const FormSurfaceProvider = FormSurfaceContext.Provider;

/** Defaults to `page`, so a form rendered anywhere else keeps its old look. */
export function useFormSurface(): FormSurface {
  return useContext(FormSurfaceContext);
}

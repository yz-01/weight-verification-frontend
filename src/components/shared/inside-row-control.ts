"use client";

import { createContext } from "react";

/**
 * True inside a list row that is itself the control - a `DataTable` row with
 * `onRowClick`, which is `role="button"`.
 *
 * Something clickable of its own inside it (a photograph's thumbnail) would be
 * a button inside a button: a screen reader announces both and Tab stops on
 * both (FABLE_AUDIT_E3 #11). A `PhotoThumb` here draws a picture only; the
 * row's own click opens the record, whose page has every photograph.
 */
export const InsideRowControl = createContext(false);

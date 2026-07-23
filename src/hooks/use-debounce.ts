"use client";

import { useEffect, useState } from "react";

/**
 * Delay a value until it stops changing.
 *
 * Search boxes write to the URL, and the URL drives the query. Without this,
 * typing "concrete" would fire eight requests and push eight history entries,
 * so the back button would walk backwards through the letters of a word.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

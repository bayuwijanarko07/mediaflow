"use client";

import { useEffect, useState } from "react";

/**
 * Debounce nilai input search — supaya query ke backend tidak
 * fired tiap keystroke, cukup setelah user berhenti mengetik.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
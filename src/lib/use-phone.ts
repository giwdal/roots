"use client"

import { useSyncExternalStore } from "react"

// Phones = below md (768 px), the same line as Tailwind's `max-md:` and the CSS in globals.css.
export const PHONE_QUERY = "(max-width: 767.98px)"

const subscribe = (cb: () => void) => {
  const m = window.matchMedia(PHONE_QUERY)
  m.addEventListener("change", cb)
  return () => m.removeEventListener("change", cb)
}

/** true on phones, false from md, null while rendering on the server / before hydration. */
export function usePhone(): boolean | null {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => null)
}

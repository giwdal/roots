"use client"

import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

// Phones: a page's header buttons (gear, actions, ⋯) move into the top bar next to Sprout (slot in <AppShell>), so
// no lonely button row sits above the content. Tablet/desktop (and before hydration): inline in the page header.
const PHONE = "(max-width: 767px)"
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(PHONE)
  m.addEventListener("change", cb)
  return () => m.removeEventListener("change", cb)
}

export function HeaderActions({ children }: { children: React.ReactNode }) {
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false)
  const slot = phone ? document.getElementById("topbar-actions") : null
  return slot ? createPortal(children, slot) : <>{children}</>
}

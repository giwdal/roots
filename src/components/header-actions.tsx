"use client"

import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

// A page's header buttons (gear, actions, ⋯, the primary "+ Neu …") live in the top bar next to Sprout (slot
// #topbar-actions in <AppShell>), on every device. `desktop` = only from md: on phones the primary action is the
// round button beside the tab bar (fixed, must stay out of the top bar). Before hydration: inline in the header.
const PHONE = "(max-width: 767px)"
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(PHONE)
  m.addEventListener("change", cb)
  return () => m.removeEventListener("change", cb)
}

export function HeaderActions({ children, desktop }: { children: React.ReactNode; desktop?: boolean }) {
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => null)
  const slot = phone === null || (desktop && phone) ? null : document.getElementById("topbar-actions")
  return slot ? createPortal(children, slot) : <>{children}</>
}

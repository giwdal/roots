"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

// A page's header buttons (gear, actions, ⋯, the primary "+ Neu …") live in the top bar next to Sprout (slot
// #topbar-actions in <AppShell>), on every device. `desktop` = only from md: on phones the primary action is the
// round button beside the tab bar (fixed, must stay out of the top bar). Only while the page is shown (Next keeps
// visited pages alive hidden; their effects clean up, so their buttons leave the bar). Before that: inline.
const PHONE = "(max-width: 767px)"
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(PHONE)
  m.addEventListener("change", cb)
  return () => m.removeEventListener("change", cb)
}

export function HeaderActions({ children, desktop }: { children: React.ReactNode; desktop?: boolean }) {
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    setShown(true) // eslint-disable-line react-hooks/set-state-in-effect -- shown = this page is the visible one
    return () => setShown(false)
  }, [])
  const slot = !shown || phone === null || (desktop && phone) ? null : document.getElementById("topbar-actions")
  return slot ? createPortal(children, slot) : <>{children}</> // inline: before hydration, phones (primary), no slot
}

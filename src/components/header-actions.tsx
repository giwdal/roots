"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { usePhone } from "@/lib/use-phone"

// A page's header buttons (gear, actions, ⋯, the primary "+ Neu …") live in the top bar next to Sprout (slot
// #topbar-actions in <AppShell>). From md: `children` as they are. Phones: `phone` instead (the header's one ⋯,
// <PhoneMenu>; `false` = nothing; left out = `children`). `desktop` = only from md: on phones the primary action is
// the round button beside the tab bar (fixed, must stay out of the top bar). Only while the page is shown (Next keeps
// visited pages alive hidden; their effects clean up, so their buttons leave the bar). Before that: inline, and on
// phones hidden, so the desktop buttons never flash in a phone's page header.
export function HeaderActions({ children, desktop, phone: phoneContent }: { children: React.ReactNode; desktop?: boolean; phone?: React.ReactNode }) {
  const phone = usePhone()
  const [shown, setShown] = useState(false)
  useEffect(() => {
    setShown(true) // eslint-disable-line react-hooks/set-state-in-effect -- shown = this page is the visible one
    return () => setShown(false)
  }, [])
  if (desktop && phone) return <>{children}</> // the round primary button
  const slot = !shown || phone === null ? null : document.getElementById("topbar-actions")
  if (!slot) return desktop ? <>{children}</> : <div className="contents max-md:hidden">{children}</div>
  const content = phone && phoneContent !== undefined ? phoneContent : children
  return content ? createPortal(content, slot) : null
}

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Re-reads the server parts of the page (unread count in the sidebar / Menü, lists) when the person comes back to
 * the tab or the home-screen app after a minute or more, so counts don't wait for the next navigation.
 */
export function RefreshOnReturn({ after = 60_000 }: { after?: number }) {
  const router = useRouter()
  useEffect(() => {
    let hidden = 0
    const change = () => {
      if (document.visibilityState === "hidden") hidden = Date.now()
      else if (hidden && Date.now() - hidden >= after) router.refresh()
    }
    document.addEventListener("visibilitychange", change)
    return () => document.removeEventListener("visibilitychange", change)
  }, [router, after])
  return null
}

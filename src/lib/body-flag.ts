"use client"

import { useEffect } from "react"

// A flag on <body> while a component is really on screen (data-<name>). CSS like `body:has([data-slot=save-bar])`
// also matched pages Next keeps alive hidden in the background, so the phone tab bar stayed hidden and the menu
// button stayed visible after leaving such a page. Effects run only for the shown page, so this follows the screen.
const counts = new Map<string, number>()

export function useBodyFlag(name: string, on: boolean) {
  useEffect(() => {
    if (!on) return
    const n = (counts.get(name) ?? 0) + 1
    counts.set(name, n)
    document.body.setAttribute(`data-${name}`, "")
    return () => {
      const left = (counts.get(name) ?? 1) - 1
      counts.set(name, left)
      if (left <= 0) document.body.removeAttribute(`data-${name}`)
    }
  }, [name, on])
}

/** For server components: mark the page while it is shown (e.g. a page with its own bottom tab bar). */
export function BodyFlag({ name }: { name: string }) {
  useBodyFlag(name, true)
  return null
}

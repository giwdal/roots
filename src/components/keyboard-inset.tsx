"use client"

import { useEffect } from "react"

// Phones: the on-screen keyboard covers the bottom of the layout viewport, where sticky/fixed bars sit. Its height
// goes into --keyboard on <html> (0 when closed), so the SaveBar lifts above it and focused fields scroll clear of it.
export function KeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => root.style.setProperty("--keyboard", `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`)
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    update()
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      root.style.removeProperty("--keyboard")
    }
  }, [])
  return null
}

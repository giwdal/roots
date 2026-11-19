"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/** A sideways-scrolling row of link chips that scrolls the current one (`aria-current`) into view, so a deep link to
 *  the fifth event doesn't open with its chip hidden off-screen. */
export function ChipRow({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = ref.current
    const current = nav?.querySelector<HTMLElement>("[aria-current=true], [aria-current=page]")
    if (!nav || !current) return
    const box = nav.getBoundingClientRect()
    const chip = current.getBoundingClientRect()
    nav.scrollLeft += chip.left - box.left - (box.width - chip.width) / 2
  })
  return (
    <nav ref={ref} aria-label={label} className={cn("relative flex max-w-full overflow-x-auto", className)}>
      {children}
    </nav>
  )
}

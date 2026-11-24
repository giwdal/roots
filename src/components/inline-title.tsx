"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { PatchAction } from "@/components/inline-field"

/** A record's name as the page title, edited in place like every property (`patch<Entity>`): saves on blur or Enter, Escape resets. */
export function InlineTitle({ action, id, field = "name", name, label, disabled }: { action: PatchAction; id: string; field?: string; name: string; label: string; disabled?: boolean }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [text, setText] = useState(name)
  const save = () => {
    const el = input.current
    if (!el) return
    const next = el.value.trim()
    if (!next || next === name) return void setText(name)
    start(async () => {
      const fd = new FormData()
      fd.set("id", id)
      fd.set("field", field)
      fd.set("value", next)
      const r = await action(fd)
      if (r?.error) {
        toast.error(r.error)
        setText(name)
      } else router.refresh()
    })
  }
  if (disabled) return <>{name}</>
  // The input is as wide as its text: an invisible copy of the text sizes the grid cell the input fills (cut off with the page width).
  return (
    <span className="inline-grid max-w-full grid-cols-[minmax(0,max-content)] align-top">
      <span aria-hidden className="invisible col-start-1 row-start-1 h-0 overflow-hidden px-1 whitespace-pre">{text || " "}</span>
      <input
        ref={input}
        value={text}
        size={1}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
        aria-label={label}
        disabled={pending}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            setText(name)
            requestAnimationFrame(() => input.current?.blur())
          }
        }}
        className="col-start-1 row-start-1 w-full min-w-[8ch] rounded-md bg-transparent px-1 -mx-1 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      />
    </span>
  )
}

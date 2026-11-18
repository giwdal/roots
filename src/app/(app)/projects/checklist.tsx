"use client"

import { useState, useTransition } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import type { ChecklistItem } from "@/projects/fields"
import { saveChecklistAction } from "./actions"

// Subtasks as rows to tick off; the ✕ to remove one is always visible (touch), a new one is typed + Enter. Every
// change saves at once.
export function Checklist({ taskId, initial, disabled }: { taskId: string; initial: ChecklistItem[]; disabled: boolean }) {
  const t = useT()
  const [items, setItems] = useState(initial)
  const [draft, setDraft] = useState("")
  const [, start] = useTransition()
  const save = (next: ChecklistItem[]) => {
    setItems(next)
    start(async () => {
      const r = await saveChecklistAction({ id: taskId, checklist: next })
      if (r.error) toast.error(r.error)
    })
  }
  const done = items.filter((i) => i.done).length
  return (
    <section className="grid gap-2" aria-labelledby="checklist">
      <h3 id="checklist" className="flex items-center justify-between text-sm font-medium">
        {t("projects.checklist")}
        {items.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {done}/{items.length}
          </span>
        )}
      </h3>
      {items.length > 0 && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      {items.length > 0 && (
        <ul className="grid">
          {items.map((item) => (
            <li key={item.id} className="flex min-h-10 items-center gap-3 rounded-md px-1 hover:bg-muted/60">
              <input
                type="checkbox"
                checked={item.done}
                disabled={disabled}
                aria-label={item.text}
                onChange={() => save(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
                className="size-5 shrink-0 accent-primary"
              />
              <span className={cn("flex-1 text-sm break-words", item.done && "text-muted-foreground line-through")}>{item.text}</span>
              {!disabled && (
                <Button type="button" size="icon-sm" variant="ghost" aria-label={t("projects.removeRow")} className="shrink-0 text-muted-foreground" onClick={() => save(items.filter((i) => i.id !== item.id))}>
                  <XIcon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            if (!draft.trim()) return
            save([...items, { id: crypto.randomUUID().slice(0, 8), text: draft.trim(), done: false }])
            setDraft("")
          }}
        >
          <PlusIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("projects.addRow")} aria-label={t("projects.addRow")} maxLength={300} enterKeyHint="done" autoComplete="off" className="pl-8" />
        </form>
      )}
    </section>
  )
}

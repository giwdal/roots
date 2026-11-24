"use client"

import { useState, useTransition } from "react"
import { CheckCircle2Icon, CircleIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { markAttendance } from "./actions"

/**
 * Taking attendance on a phone (Mindbody / Eversports style): a tap on a name marks the person present (or not) and
 * saves at once; "Alle da" marks everyone. Errors come back as a toast and the tap is undone.
 */
export function AttendanceList({ sessionId, people, present, canManage }: { sessionId: string; people: { id: string; name: string }[]; present: string[]; canManage: boolean }) {
  const t = useT()
  const [here, setHere] = useState(() => new Set(present))
  const [, start] = useTransition()
  const save = (ids: string[], on: boolean) => {
    const before = new Set(here)
    const next = new Set(here)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    setHere(next)
    start(async () => {
      const r = await markAttendance({ sessionId, participantIds: ids, present: on })
      if (r.error) {
        toast.error(r.error)
        setHere(before)
      }
    })
  }
  const all = people.length > 0 && people.every((p) => here.has(p.id))
  return (
    <div className="grid gap-3">
      <div className="flex min-h-(--control) flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium tabular-nums">{t("courses.presentOf", { present: people.filter((p) => here.has(p.id)).length, total: people.length })}</span>
        {canManage && !all && (
          <Button type="button" size="sm" variant="outline" onClick={() => save(people.filter((p) => !here.has(p.id)).map((p) => p.id), true)}>
            {t("courses.allPresent")}
          </Button>
        )}
      </div>
      <ul className="grid divide-y rounded-lg border">
        {people.map((p) => {
          const on = here.has(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!canManage}
                onClick={() => save([p.id], !on)}
                className={cn("flex min-h-12 w-full touch-manipulation items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted active:bg-muted disabled:pointer-events-none", on && "font-medium")}
              >
                {on ? <CheckCircle2Icon className="size-5 shrink-0 text-[var(--success)]" aria-hidden /> : <CircleIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

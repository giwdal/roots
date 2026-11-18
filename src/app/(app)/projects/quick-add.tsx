"use client"

import { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CornerDownLeftIcon, Loader2Icon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { quickAddTaskAction } from "./actions"

/**
 * Type a title, Enter: the task is created (in `statusId` or the first column, in `projectId`, assigned to me with
 * `mine`) and the field is ready for the next one — the list or board shows it after the refresh.
 */
export function QuickAdd({ statusId, projectId, mine, className }: { statusId?: string; projectId?: string; mine?: boolean; className?: string }) {
  const t = useT()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault()
        const el = input.current
        const title = el?.value.trim()
        if (!el || !title || pending) return
        start(async () => {
          const r = await quickAddTaskAction({ title, statusId, projectId, mine })
          if (r.error) return void toast.error(r.error)
          el.value = ""
          el.focus()
          router.refresh()
        })
      }}
    >
      <PlusIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input ref={input} name="title" maxLength={300} placeholder={t("projects.quickAdd")} aria-label={t("projects.quickAdd")} enterKeyHint="done" autoComplete="off" className="pr-9 pl-8" />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground" aria-hidden>
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : <CornerDownLeftIcon className="size-4 opacity-60" />}
      </span>
    </form>
  )
}

"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DateInput } from "@/components/date-input"
import { TypedInput, type InputKind } from "@/components/typed-input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/** Server action for one field: gets `id`, `field` and `value`, validates like the full form, returns an error text. */
export type PatchAction = (form: FormData) => Promise<{ error?: string } | void>

type Kind = "text" | "textarea" | "date" | "choice" | InputKind

// Looks like text until touched (Linear): no border, a soft hover, the field's ring only while editing.
const GHOST =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 -mx-2 text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:border-input focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none"

/**
 * A property edited where it is shown, the Linear way: the value looks like text; a click (or Tab) edits it in place,
 * Enter or leaving saves on its own, Esc puts the old value back; no save/cancel buttons. Choices open a small menu
 * with a filter. Errors come back as a toast and the old value stays. For single values in a record's properties —
 * compound values (address, bank) open a small dialog instead, creating stays a form.
 */
export function InlineField({
  action,
  id,
  field,
  value,
  label,
  kind = "text",
  options,
  display,
  disabled,
}: {
  action: PatchAction
  id: string
  field: string
  value: string | null
  label: string
  kind?: Kind
  options?: { value: string; label: string }[] // kind "choice"
  display?: React.ReactNode // how the saved value looks when it isn't being edited (link, badge …)
  disabled?: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")

  const save = (next: string, revert?: () => void) => {
    if (next === (value ?? "")) return
    const data = new FormData()
    data.set("id", id)
    data.set("field", field)
    data.set("value", next)
    start(async () => {
      const r = await action(data)
      if (r?.error) {
        toast.error(r.error)
        revert?.()
        return
      }
      router.refresh()
    })
  }

  if (disabled) return <div className="min-w-0 py-1 text-sm break-words">{value ? (display ?? value) : <span className="text-muted-foreground">–</span>}</div>

  const spinner = pending && <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
  const empty = <span className="text-muted-foreground">{t("common.emptyValue")}</span>

  if (kind === "choice") {
    const current = options?.find((o) => o.value === value)
    const shown = (options ?? []).filter((o) => o.label.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
    return (
      <Popover open={open} onOpenChange={(o) => (setOpen(o), setFilter(""))}>
        <PopoverTrigger className={cn(GHOST, "flex items-center gap-2 text-left")} aria-label={t("common.editField", { field: label })}>
          <span className="min-w-0 flex-1 truncate">{current ? (display ?? current.label) : empty}</span>
          {spinner}
        </PopoverTrigger>
        <PopoverContent sheet title={label} align="start" className="w-64 p-1">
          {(options?.length ?? 0) > 7 && (
            <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("common.search")} className="mb-1 h-(--control-sm) w-full rounded-md bg-muted/60 px-2 text-sm outline-none" />
          )}
          <div className="grid max-h-72 overflow-y-auto">
            {[{ value: "", label: "–" }, ...shown].map((o) => (
              <button
                key={o.value || "-"}
                type="button"
                onClick={() => (setOpen(false), save(o.value))}
                className="flex min-h-(--control-sm) items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted max-md:min-h-12"
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === (value ?? "") && <CheckIcon className="size-4 text-muted-foreground" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  // Not being edited and the value has its own look (a mailto link, a badge): show that; a click beside it edits.
  if (!editing && (display || kind === "date"))
    return (
      <div role="button" tabIndex={0} onClick={(e) => !(e.target as Element).closest("a") && setEditing(true)} onKeyDown={(e) => e.key === "Enter" && setEditing(true)} className={cn(GHOST, "flex cursor-text items-center gap-2")} aria-label={t("common.editField", { field: label })}>
        <span className="min-w-0 flex-1 break-words">{value ? (display ?? value) : empty}</span>
        {spinner}
      </div>
    )

  if (kind === "date")
    return (
      <div className="flex items-center gap-2">
        <DateInput name={`${field}-inline`} defaultValue={value ?? ""} aria-label={label} onValueChange={(v: string) => (setEditing(false), save(v))} />
        {spinner}
      </div>
    )

  return <GhostInput kind={kind} value={value} label={label} placeholder={t("common.emptyValue")} autoFocus={editing} onSave={(v, revert) => (setEditing(false), save(v, revert))} onCancel={() => setEditing(false)} spinner={spinner} />
}

function GhostInput({ kind, value, label, placeholder, autoFocus, onSave, onCancel, spinner }: { kind: Kind; value: string | null; label: string; placeholder: string; autoFocus: boolean; onSave: (v: string, revert: () => void) => void; onCancel: () => void; spinner: React.ReactNode }) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const revert = () => ref.current && (ref.current.value = value ?? "")
  const common = {
    ref,
    defaultValue: value ?? "",
    "aria-label": label,
    placeholder,
    autoFocus,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => onSave(e.currentTarget.value.trim(), revert),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        revert()
        onCancel()
        e.currentTarget.blur()
      } else if (e.key === "Enter" && (kind !== "textarea" || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        e.currentTarget.blur()
      }
    },
  }
  return (
    <div className="flex items-start gap-2">
      {kind === "textarea" ? (
        <textarea {...common} rows={3} className={cn(GHOST, "field-sizing-content min-h-8 resize-none")} />
      ) : kind === "text" ? (
        <input {...common} className={GHOST} />
      ) : (
        <TypedInput kind={kind as InputKind} {...common} className={cn(GHOST, "h-auto")} />
      )}
      {spinner}
    </div>
  )
}

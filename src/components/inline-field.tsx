"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, Loader2Icon, PencilIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { DateInput } from "@/components/date-input"
import { TypedInput, type InputKind } from "@/components/typed-input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/** Server action for one field: gets `id`, `field` and `value`, validates like the full form, returns an error text. */
export type PatchAction = (form: FormData) => Promise<{ error?: string } | void>

type Kind = "text" | "textarea" | "date" | "choice" | InputKind

/**
 * A property that is edited where it is shown (Linear / Attio style): the value with a pencil; a tap opens the field
 * in place, Enter or leaving it saves, Esc cancels; errors come back as a toast and the field stays open. For single
 * values in a record's properties — compound values (address, bank) open a small dialog instead, creating stays a form.
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
  display?: React.ReactNode // how the saved value looks (link, badge …); default = the value
  disabled?: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const form = useRef<HTMLFormElement>(null)

  const save = () => {
    const f = form.current
    if (!f || pending) return
    const data = new FormData(f)
    if (String(data.get("value") ?? "") === (value ?? "")) return setEditing(false)
    start(async () => {
      const r = await action(data)
      if (r?.error) return void toast.error(r.error)
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing)
    return (
      <div className="group/inline flex min-h-(--control-sm) min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1 break-words">{value ? (display ?? value) : <span className="text-muted-foreground">–</span>}</div>
        {!disabled && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("common.editField", { field: label })} onClick={() => setEditing(true)} className="shrink-0 text-muted-foreground opacity-0 group-hover/inline:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
            <PencilIcon />
          </Button>
        )}
      </div>
    )

  const common = { name: "value", "aria-label": label, autoFocus: true, disabled: pending }
  const control =
    kind === "textarea" ? (
      <Textarea {...common} defaultValue={value ?? ""} rows={3} />
    ) : kind === "date" ? (
      <DateInput name="value" defaultValue={value ?? ""} aria-label={label} />
    ) : kind === "choice" ? (
      <NativeSelect {...common} defaultValue={value ?? ""} onChange={() => setTimeout(save)} className="w-full">
        <NativeSelectOption value="">–</NativeSelectOption>
        {options?.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    ) : kind === "text" ? (
      <Input {...common} defaultValue={value ?? ""} />
    ) : (
      <TypedInput kind={kind} {...common} defaultValue={value ?? ""} />
    )

  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation()
          setEditing(false)
        }
        if (e.key === "Enter" && kind === "textarea" && (e.metaKey || e.ctrlKey)) save()
      }}
      className="flex min-w-0 items-start gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <div className="min-w-0 flex-1">{control}</div>
      <Button type="submit" size="icon-sm" aria-label={t("common.save")} disabled={pending} className={cn("shrink-0", kind === "textarea" && "mt-1")}>
        {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("common.cancel")} onClick={() => setEditing(false)} className="shrink-0">
        <XIcon />
      </Button>
    </form>
  )
}

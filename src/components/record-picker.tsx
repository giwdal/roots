"use client"

import { useEffect, useId, useState, useTransition } from "react"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { useT } from "@/i18n/client"

export type PickerOption = { id: string; label: string; detail?: string }

const CREATE = "\u0000create"

/**
 * Pick one record from a big table by searching on the server (`search` = a server action returning ≤ 20 options,
 * called with "" when the field opens). Posts the id as `name`. `createLabel` + `onCreate(query)`: a last row
 * "+ … anlegen"; the caller opens its quick create and shows the new record by re-mounting with `key` + `initial`.
 */
export function RecordPicker({
  name,
  label,
  search,
  initial,
  placeholder,
  onChange,
  createLabel,
  onCreate,
  required,
  disabled,
}: {
  name: string
  label?: string
  search: (q: string) => Promise<PickerOption[]>
  initial?: PickerOption | null
  placeholder?: string
  onChange?: (picked: PickerOption | null) => void
  createLabel?: (q: string) => string
  onCreate?: (q: string) => void
  required?: boolean
  disabled?: boolean
}) {
  const t = useT()
  const id = useId()
  const [picked, setPicked] = useState<PickerOption | null>(initial ?? null)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<PickerOption[]>([])
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const items = onCreate && createLabel ? [...results, { id: CREATE, label: createLabel(q.trim()) }] : results
  const pick = (r: PickerOption | null) => {
    setPicked(r)
    onChange?.(r)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => start(async () => setResults(await search(q))), 200)
    return () => clearTimeout(timer)
  }, [q, open, search])

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      {picked ? (
        <div className="flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {picked.label}
            {picked.detail && <span className="text-muted-foreground"> · {picked.detail}</span>}
          </span>
          {!disabled && (
            <Button type="button" size="icon-sm" variant="ghost" aria-label={t("common.clear")} onClick={() => pick(null)}>
              <XIcon />
            </Button>
          )}
        </div>
      ) : (
        <Combobox
          items={items}
          filter={null}
          itemToStringLabel={(r: PickerOption) => r.label}
          value={null}
          onValueChange={(r: PickerOption | null) => {
            if (!r) return
            if (r.id === CREATE) {
              setOpen(false)
              onCreate?.(q.trim())
            } else pick(r)
          }}
          inputValue={q}
          onInputValueChange={setQ}
          open={open}
          onOpenChange={setOpen}
          autoHighlight
          disabled={disabled}
        >
          <div className="relative">
            <ComboboxInput id={id} placeholder={placeholder ?? t("common.search")} autoComplete="off" showTrigger={false} required={required && !picked} className="w-full" />
            {pending && <Loader2Icon className="absolute top-2 right-2 size-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          <ComboboxContent>
            <ComboboxEmpty>{t("tags.noMatch")}</ComboboxEmpty>
            <ComboboxList>
              {(r: PickerOption) =>
                r.id === CREATE ? (
                  <ComboboxItem key={r.id} value={r} className="text-primary">
                    <PlusIcon /> {r.label}
                  </ComboboxItem>
                ) : (
                  <ComboboxItem key={r.id} value={r}>
                    <span className="min-w-0 truncate">
                      {r.label}
                      {r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}
                    </span>
                  </ComboboxItem>
                )
              }
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
    </div>
  )
}

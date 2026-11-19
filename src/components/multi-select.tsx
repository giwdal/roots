"use client"

import { useEffect, useId, useRef, useState } from "react"
import { PlusIcon } from "lucide-react"
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList, useComboboxAnchor } from "@/components/ui/combobox"
import { useT } from "@/i18n/client"

export type MultiOption = { value: string; label: string }

const CREATE = "\u0000create:"

/**
 * Several values as chips (`single`: one value, picking another replaces it) + a search field with a dropdown
 * (Base UI combobox: arrows, Enter, Backspace removes the last chip, ← moves into the chips).
 * `creatable`: the dropdown also offers „<typed>“ as a new value. Posts `name` once per value, or comma-joined with `joined`.
 * ponytail: filters the given options in the browser; pickers over big tables use a server search (ContactPicker).
 */
export function MultiSelect({
  name,
  options,
  defaultValue = [],
  creatable,
  joined,
  single,
  disabled,
  id: givenId,
  placeholder,
  max = 50,
}: {
  name: string
  options: MultiOption[]
  defaultValue?: string[]
  creatable?: boolean
  joined?: boolean
  single?: boolean
  disabled?: boolean
  id?: string
  placeholder?: string
  max?: number
}) {
  const t = useT()
  const ownId = useId()
  const id = givenId ?? ownId
  const anchor = useComboboxAnchor()
  const [selected, setSelected] = useState(defaultValue)
  const [q, setQ] = useState("")
  const labelOf = (v: string) => (v.startsWith(CREATE) ? v.slice(CREATE.length) : (options.find((o) => o.value === v)?.label ?? v))
  const term = q.trim().slice(0, 40)
  const lower = term.toLowerCase()
  const has = (v: string) => selected.some((s) => s.toLowerCase() === v.toLowerCase())
  const hits = options.filter((o) => o.label.toLowerCase().includes(lower)).slice(0, 30).map((o) => o.value)
  const canCreate = creatable && term && !has(term) && !options.some((o) => o.label.toLowerCase() === lower)
  const items = canCreate ? [...hits, CREATE + term] : hits

  // Chips change no real input: send an "input" event so forms that react to it (autosave) notice.
  const box = useRef<HTMLDivElement>(null)
  // Compared with the last value (effects also run twice on mount in dev), so loading the page changes nothing.
  const last = useRef(selected)
  useEffect(() => {
    if (last.current === selected) return
    last.current = selected
    box.current?.dispatchEvent(new Event("input", { bubbles: true }))
  }, [selected])

  return (
    <div ref={box}>
      {joined ? <input type="hidden" name={name} value={selected.join(", ")} /> : selected.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <Combobox
        multiple
        autoHighlight
        items={options.map((o) => o.value)}
        filteredItems={items}
        itemToStringLabel={labelOf}
        value={selected}
        onValueChange={(next: string[]) => {
          const picked = next.map((v) => (v.startsWith(CREATE) ? v.slice(CREATE.length) : v))
          setSelected(single ? picked.slice(-1) : picked.slice(0, max))
          setQ("")
        }}
        inputValue={q}
        onInputValueChange={setQ}
        disabled={disabled}
      >
        <ComboboxChips ref={anchor}>
          {selected.map((v) => (
            <ComboboxChip key={v} showRemove={!disabled} aria-label={labelOf(v)}>
              {labelOf(v)}
            </ComboboxChip>
          ))}
          <ComboboxChipsInput id={id} placeholder={selected.length ? "" : (placeholder ?? t("common.search"))} />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>{t("tags.noMatch")}</ComboboxEmpty>
          <ComboboxList>
            {(v: string) =>
              v.startsWith(CREATE) ? (
                <ComboboxItem key={v} value={v} className="text-primary">
                  <PlusIcon /> {t("tags.create", { tag: labelOf(v) })}
                </ComboboxItem>
              ) : (
                <ComboboxItem key={v} value={v}>
                  {labelOf(v)}
                </ComboboxItem>
              )
            }
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}

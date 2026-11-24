"use client"

import { useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusCircleIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/client"
import { DOT, PICKABLE_COLORS } from "@/projects/fields"

export type ColumnRow = { id?: string; name: string; color: string; is_done: boolean }

/**
 * A board's columns as inline rows of the settings form (saved with its SaveBar, saveColumnsAction): colour (dot →
 * swatches), name, "erledigt", ↑ ↓, ✕. Each row posts <scope>_id/_name/_color/_done, read by index; order = the
 * order here. Removing a saved column asks first; the last one stays.
 */
export function ColumnRows({ scope, initial }: { scope: "task" | "project"; initial: ColumnRow[] }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const next = useRef(0)
  const [rows, setRows] = useState(() => initial.map((r, i) => ({ ...r, key: r.id ?? `i${i}` })))
  // The SaveBar listens for change events inside the form: row edits through state count as changes too.
  const changed = () => requestAnimationFrame(() => box.current?.dispatchEvent(new Event("change", { bubbles: true })))
  const update = (key: string, patch: Partial<ColumnRow>) => {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)))
    changed()
  }
  const move = (i: number, d: number) => {
    setRows((r) => {
      const o = [...r]
      ;[o[i], o[i + d]] = [o[i + d], o[i]]
      return o
    })
    changed()
  }
  return (
    <div ref={box} className="grid gap-2">
      <ul className="grid divide-y rounded-xl border">
        {rows.map((r, i) => (
          <li key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <input type="hidden" name={`${scope}_id`} value={r.id ?? ""} />
            <input type="hidden" name={`${scope}_color`} value={r.color} />
            <input type="hidden" name={`${scope}_done`} value={r.is_done ? "1" : ""} />
            <Popover>
              <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("projects.color")}: ${t.dynamic(`projects.colors.${r.color}`)}`} />}>
                <span className="size-3.5 rounded-full" style={{ background: DOT[r.color] ?? DOT.gray }} aria-hidden />
              </PopoverTrigger>
              <PopoverContent sheet title={t("projects.color")} className="w-auto">
                <div className="flex flex-wrap gap-1">
                  {PICKABLE_COLORS.map((c) => (
                    <button key={c} type="button" aria-pressed={r.color === c} aria-label={t.dynamic(`projects.colors.${c}`)} onClick={() => update(r.key, { color: c })} className="grid size-10 place-items-center rounded-full aria-pressed:ring-2 aria-pressed:ring-ring">
                      <span className="size-4 rounded-full" style={{ background: DOT[c] }} aria-hidden />
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Input name={`${scope}_name`} defaultValue={r.name} required maxLength={60} placeholder={t("projects.newStatus")} aria-label={t("projects.statusName")} className="min-w-32 flex-1" />
            <label className="flex min-h-(--control-sm) items-center gap-1.5 text-sm">
              <input type="checkbox" checked={r.is_done} onChange={(e) => update(r.key, { is_done: e.target.checked })} className="size-4 accent-primary" /> {t("projects.isDoneShort")}
            </label>
            <span className="ml-auto flex">
              <Button type="button" size="icon-sm" variant="ghost" aria-label={t("projects.move.up")} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpIcon />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={t("projects.move.down")} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("projects.deleteStatus")}
                disabled={rows.length <= 1}
                data-confirm={r.id ? "projects.confirmDeleteStatus" : undefined}
                onClick={() => {
                  setRows((x) => x.filter((y) => y.key !== r.key))
                  changed()
                }}
              >
                <XIcon />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          setRows((r) => [...r, { key: `n${next.current++}`, name: "", color: "gray", is_done: false }])
          changed()
        }}
        className="inline-flex min-h-8 w-fit items-center gap-1.5 text-sm link"
      >
        <PlusCircleIcon className="size-4" /> {t("projects.addColumn")}
      </button>
    </div>
  )
}

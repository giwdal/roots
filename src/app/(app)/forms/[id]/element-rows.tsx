"use client"

import { useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusCircleIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Element } from "@/forms/elements"
import { useT } from "@/i18n/client"

type Row = Element & { key: string }

/**
 * The form's elements as inline rows inside the builder's one form (saved with its SaveBar as the JSON `elements`):
 * edit in place, ↑ ↓ to reorder, ✕ removes (asks first), "+ Element hinzufügen" lists the fields not used yet, text,
 * consent and (membership forms, once) the SEPA mandate. `fields` = every field the form may use with its label.
 */
export function ElementRows({ initial, fields, membership, disabled }: { initial: Element[]; fields: { value: string; label: string }[]; membership: boolean; disabled?: boolean }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const next = useRef(0)
  const [rows, setRows] = useState<Row[]>(() => initial.map((e) => ({ ...e, key: e.id })))
  // The SaveBar listens for change events inside the form: adding, moving or removing a row is a change too.
  const changed = () => requestAnimationFrame(() => box.current?.dispatchEvent(new Event("change", { bubbles: true })))
  const set = (rows: Row[], notify = true) => {
    setRows(rows)
    if (notify) changed()
  }
  const patch = (key: string, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? ({ ...x, ...p } as Row) : x)))
  const move = (i: number, d: -1 | 1) => {
    const r = [...rows]
    ;[r[i], r[i + d]] = [r[i + d], r[i]]
    set(r)
  }
  const add = (e: Element) => set([...rows, { ...e, key: `new:${next.current++}` } as Row])
  const label = (f: string) => fields.find((x) => x.value === f)?.label ?? f
  const unused = fields.filter((f) => !rows.some((r) => r.kind === "field" && r.field === f.value))
  const json = JSON.stringify(rows.map(({ key, ...e }) => (key.startsWith("new:") ? { ...e, id: undefined } : e)))

  return (
    <div ref={box} className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <input type="hidden" name="elements" value={json} />
      <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {rows.map((e, i) => (
          <li key={e.key} className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.dynamic(`forms.kinds.${e.kind}`)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {e.kind === "field" ? label(e.field) : e.kind === "consent" ? e.label : e.kind === "text" ? e.body.slice(0, 80) : t("forms.mandate")}
              </span>
              {!disabled && (
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={t("forms.moveUp")} title={t("forms.moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={t("forms.moveDown")} title={t("forms.moveDown")} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={t("forms.remove")} title={t("forms.remove")} data-confirm="forms.confirmRemoveElement" onClick={() => set(rows.filter((x) => x.key !== e.key))}>
                    <XIcon />
                  </Button>
                </div>
              )}
            </div>
            {e.kind === "field" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`l-${e.key}`}>{t("forms.label")}</Label>
                  <Input id={`l-${e.key}`} value={e.label ?? ""} onChange={(v) => patch(e.key, { label: v.target.value })} maxLength={200} placeholder={label(e.field)} disabled={disabled} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`h-${e.key}`}>{t("forms.help")}</Label>
                  <Input id={`h-${e.key}`} value={e.help ?? ""} onChange={(v) => patch(e.key, { help: v.target.value })} maxLength={500} disabled={disabled} />
                </div>
              </div>
            )}
            {e.kind === "consent" && (
              <div className="grid gap-2">
                <Label htmlFor={`c-${e.key}`}>{t("forms.consentText")}</Label>
                <Textarea id={`c-${e.key}`} rows={2} value={e.label} onChange={(v) => patch(e.key, { label: v.target.value })} maxLength={1000} disabled={disabled} />
              </div>
            )}
            {e.kind === "text" && (
              <div className="grid gap-2">
                <Label htmlFor={`b-${e.key}`}>{t("forms.textBody")}</Label>
                <Textarea id={`b-${e.key}`} rows={3} value={e.body} onChange={(v) => patch(e.key, { body: v.target.value })} maxLength={5000} disabled={disabled} />
              </div>
            )}
            {e.kind === "mandate" && <p className="text-xs text-muted-foreground">{t("forms.mandateHint")}</p>}
            {(e.kind === "field" || e.kind === "consent") && (
              <label className="flex min-h-8 w-fit items-center gap-2 text-sm">
                <input type="checkbox" checked={e.required} onChange={(v) => patch(e.key, { required: v.target.checked })} disabled={disabled} className="size-4 accent-primary" /> {t("forms.required")}
              </label>
            )}
          </li>
        ))}
      </ol>
      {!disabled && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className="inline-flex min-h-8 w-fit items-center gap-1.5 text-sm text-[var(--link)] hover:underline" />}>
            <PlusCircleIcon className="size-4" /> {t("forms.addElement")}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" title={t("forms.addElement")} className="max-h-80 min-w-56 overflow-y-auto">
            {unused.length > 0 && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("forms.kinds.field")}</DropdownMenuLabel>
                  {unused.map((f) => (
                    <DropdownMenuItem key={f.value} onClick={() => add({ id: "", kind: "field", field: f.value, required: false })}>
                      {f.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => add({ id: "", kind: "text", body: "" })}>{t("forms.kinds.text")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => add({ id: "", kind: "consent", label: t("forms.consent"), required: true })}>{t("forms.kinds.consent")}</DropdownMenuItem>
            {membership && !rows.some((r) => r.kind === "mandate") && <DropdownMenuItem onClick={() => add({ id: "", kind: "mandate" })}>{t("forms.mandate")}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

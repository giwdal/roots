"use client"

import { useState } from "react"
import { Choice } from "@/components/choice"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"
import { DOT, PICKABLE_COLORS } from "@/projects/fields"

/**
 * A select field's options (one per line or comma-separated) and a colour per option. The colour rows follow the
 * typed options at once, so a new option gets its colour in the same save. Posts `options`, `color_name_<i>`, `color_<i>`.
 */
export function OptionRows({ defaultOptions, colors }: { defaultOptions: string[]; colors: Record<string, string> }) {
  const t = useT()
  const [text, setText] = useState(defaultOptions.join("\n"))
  const options = [...new Set(text.split(/[\n,]/).map((o) => o.trim().slice(0, 100)).filter(Boolean))]
  const [picked, setPicked] = useState(colors)
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="f-options">{t("fields.options")}</Label>
        <Textarea id="f-options" name="options" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-describedby="f-options-help" />
        <p id="f-options-help" className="text-xs text-muted-foreground">
          {t("fields.optionsHint")}
        </p>
      </div>
      {options.length > 0 && (
        // A colour per option (calendar, badges).
        <fieldset className="grid gap-2" onChange={(e) => {
          const el = e.target as unknown as HTMLInputElement
          const i = /^color_(\d+)$/.exec(el.name)?.[1]
          if (i != null) setPicked((p) => ({ ...p, [options[Number(i)]]: el.value }))
        }}>
          <legend className="mb-1 text-sm font-medium">{t("fields.colors")}</legend>
          {options.map((o, i) => (
            <div key={o} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2 text-sm">
              <input type="hidden" name={`color_name_${i}`} value={o} />
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ background: DOT[picked[o] ?? ""] ?? "transparent" }} aria-hidden />
                <span className="truncate">{o}</span>
              </span>
              <Choice name={`color_${i}`} label={t("fields.colorFor", { option: o })} defaultValue={picked[o] ?? ""} emptyLabel={t("fields.noColor")} options={PICKABLE_COLORS.map((c) => ({ value: c, label: t.dynamic(`projects.colors.${c}`) }))} />
            </div>
          ))}
        </fieldset>
      )}
    </>
  )
}

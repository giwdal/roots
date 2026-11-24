"use client"

import { useState } from "react"
import { Choice } from "@/components/choice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"

export type RuleField = { key: string; label: string; type: string; options: string[] }

// "Which events count": an event custom field and the value it must have. The value control follows the field's type:
// a select field offers its options, a yes/no field only "Yes" (a "No" is not stored on events), a text field is typed.
// shortcut: with more than 15 event fields Choice becomes a search box that fires no change events; raise the limit then.
export function VisitRuleFields({ id, fields, field, value, problem }: { id: string; fields: RuleField[]; field: string | null; value: string | null; problem: boolean }) {
  const t = useT()
  const [key, setKey] = useState(field ?? "")
  const def = fields.find((f) => f.key === key)
  return (
    <div className="grid gap-3">
      <div
        className="grid gap-2"
        onChange={(e) => {
          const el = e.target as HTMLInputElement
          if (el.name === "visit_count_field") setKey(el.value)
        }}
      >
        <Label htmlFor={`${id}-field`}>{t("membership.countRuleField")}</Label>
        <Choice id={`${id}-field`} name="visit_count_field" label={t("membership.countRuleField")} dropdown emptyLabel={t("membership.countRuleAll")} defaultValue={field} options={fields.map((f) => ({ value: f.key, label: f.label }))} />
      </div>
      {def && (
        <div key={def.key} className="grid gap-2">
          <Label htmlFor={`${id}-value`}>{t("membership.countRuleValue", { field: def.label })}</Label>
          {def.type === "select" ? (
            <Choice id={`${id}-value`} name="visit_count_value" label={def.label} required dropdown defaultValue={field === def.key ? value : null} options={def.options.map((o) => ({ value: o, label: o }))} />
          ) : def.type === "boolean" ? (
            <>
              <input type="hidden" name="visit_count_value" value="true" />
              <p id={`${id}-value`} className="text-sm">{t("membership.countRuleYes")}</p>
            </>
          ) : (
            <Input id={`${id}-value`} name="visit_count_value" maxLength={200} required defaultValue={field === def.key ? (value ?? "") : ""} />
          )}
        </div>
      )}
      {problem && <p className="text-sm text-destructive">{t("membership.countRuleProblem")}</p>}
      <p className="text-xs text-muted-foreground">{t("membership.countRuleHint")}</p>
    </div>
  )
}

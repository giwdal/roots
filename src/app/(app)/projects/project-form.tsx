import { Choice } from "@/components/choice"
import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { DateInput } from "@/components/date-input"
import { FormCard } from "@/components/page"
import { RichTextEditor } from "@/components/rich-text-editor"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { T } from "@/i18n/translate"
import type { FieldDef } from "@/lib/custom-fields"
import { DOT, PICKABLE_COLORS } from "@/projects/fields"

/**
 * The project's fields for /projects/new: Projekt (name, description), Details (status, lead, dates, colour) and the
 * org's custom fields. On the project page every value is edited in place instead. `start` pre-fills the start date.
 */
export function ProjectFields({ t, statuses, team, defs, start }: { t: T; statuses: { id: string; name: string }[]; team: { id: string; name: string }[]; defs: FieldDef[]; start?: string }) {
  return (
    <>
      <FormCard id="project" title={t("projects.project")}>
        <div className="grid gap-2">
          <Label htmlFor="pj-name">{t("projects.name")}</Label>
          <Input id="pj-name" name="name" maxLength={200} required autoFocus className="text-base font-medium" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pj-desc">{t("projects.descriptionOptional")}</Label>
          <RichTextEditor id="pj-desc" name="description" />
        </div>
      </FormCard>
      <FormCard id="details" title={t("projects.details")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2 sm:col-span-2">
            <Label htmlFor="pj-status">{t("projects.status")}</Label>
            <Choice id="pj-status" name="status_id" label={t("projects.status")} required defaultValue={statuses[0]?.id} options={statuses.map((s) => ({ value: s.id, label: s.name }))} />
          </div>
          <div className="grid content-start gap-2 sm:col-span-2">
            <Label htmlFor="pj-lead">{t("projects.lead")}</Label>
            <Choice id="pj-lead" name="lead_id" label={t("projects.lead")} emptyLabel={t("projects.noLead")} options={team.map((m) => ({ value: m.id, label: m.name }))} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="pj-start">{t("projects.start")}</Label>
            <DateInput id="pj-start" name="start_on" type="date" defaultValue={start ?? ""} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="pj-end">{t("projects.end")}</Label>
            <DateInput id="pj-end" name="end_on" type="date" />
          </div>
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">{t("projects.color")}</legend>
            <div className="flex gap-1">
              {PICKABLE_COLORS.map((c) => (
                <label key={c} className="grid size-9 cursor-pointer place-items-center rounded-full has-checked:ring-2 has-checked:ring-ring">
                  <input type="radio" name="color" value={c} defaultChecked={c === "blue"} className="sr-only" aria-label={t.dynamic(`projects.colors.${c}`)} />
                  <span className="size-4 rounded-full" style={{ background: DOT[c] }} aria-hidden />
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {defs.length > 0 && <CustomFieldInputs defs={defs} idPrefix="pj-custom" />}
      </FormCard>
    </>
  )
}

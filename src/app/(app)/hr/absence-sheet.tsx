import Link from "next/link"
import { Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { DateInput } from "@/components/date-input"
import { DetailList } from "@/components/detail-list"
import { Notice } from "@/components/notice"
import { RecordPicker } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { UrlSheet } from "@/components/url-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ABSENCE_KINDS } from "@/hr/fields"
import { absenceDays } from "@/hr/pay"
import type { T } from "@/i18n/translate"
import { deleteAbsence, saveAbsence, searchEmployees } from "./actions"

type Absence = { id: string; kind: string; starts_on: string; ends_on: string; half_day: boolean; note: string | null; employee_id: string }

/**
 * One absence, the same sheet on Abwesenheiten and on a person's page: hr.manage edits (one form + SaveBar, delete in
 * ⋯ asks first), hr.view reads. `employee`: the person (fixed on their page, `pick` = choose with a search picker).
 */
export function AbsenceSheet({ t, absence, employee, pick, canManage, returnTo, defaults = {}, error }: { t: T; absence?: Absence | null; employee: { id: string; name: string } | null; pick?: boolean; canManage: boolean; returnTo: string; defaults?: { start?: string; end?: string }; error?: string }) {
  const day = (v: string) => t.date(v, { dateStyle: "medium" })
  const toPerson = employee && pick && (
    <Button render={<Link href={`/hr/${employee.id}`} />} nativeButton={false} size="sm" variant="outline">
      {t("hr.toPerson")}
    </Button>
  )
  return (
    <UrlSheet
      params={["new", "edit", "start", "end", "employee"]}
      title={absence ? (canManage ? t("hr.editAbsence") : t.dynamic(`hr.kinds.${absence.kind}`)) : t("hr.addAbsence")}
      meta={absence && [employee?.name, t("hr.days", { count: absenceDays(absence) })].filter(Boolean).join(" · ")}
      actions={absence && toPerson}
      menu={
        absence &&
        canManage && (
          <ActionsMenu>
            <MenuSubmit form="delete-absence" icon={<Trash2Icon />} destructive confirm="hr.confirmDeleteAbsence">
              {t("hr.deleteAbsence")}
            </MenuSubmit>
          </ActionsMenu>
        )
      }
    >
      <Notice error={error} />
      {canManage ? (
        <form action={saveAbsence} className="grid gap-4">
          {absence && <input type="hidden" name="id" value={absence.id} />}
          <input type="hidden" name="return" value={returnTo} />
          {pick ? <RecordPicker name="employee_id" label={t("hr.employee")} search={searchEmployees} initial={employee && { id: employee.id, label: employee.name }} required /> : employee && <input type="hidden" name="employee_id" value={employee.id} />}
          <div className="grid gap-2">
            <Label htmlFor="ab-kind">{t("hr.kind")}</Label>
            <Choice id="ab-kind" name="kind" label={t("hr.kind")} required defaultValue={absence?.kind ?? "vacation"} options={ABSENCE_KINDS.map((k) => ({ value: k, label: t.dynamic(`hr.kinds.${k}`) }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ab-start">{t("hr.from")}</Label>
              <DateInput id="ab-start" name="starts_on" type="date" required defaultValue={absence?.starts_on ?? defaults.start ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ab-end">{t("hr.to")}</Label>
              <DateInput id="ab-end" name="ends_on" type="date" defaultValue={absence?.ends_on ?? defaults.end ?? ""} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="half_day" value="1" defaultChecked={absence?.half_day ?? false} className="size-4 accent-primary" />
            {t("hr.halfDayLabel")}
          </label>
          <div className="grid gap-2">
            <Label htmlFor="ab-note">{t("hr.note")}</Label>
            <Input id="ab-note" name="note" maxLength={500} defaultValue={absence?.note ?? ""} />
          </div>
          <SaveBar label={absence ? undefined : t("hr.addAbsence")} always={!absence} />
        </form>
      ) : (
        absence && (
          <DetailList
            items={[
              { label: t("hr.employee"), value: employee?.name },
              { label: t("hr.kind"), value: t.dynamic(`hr.kinds.${absence.kind}`) },
              { label: t("hr.from"), value: day(absence.starts_on) },
              { label: t("hr.to"), value: day(absence.ends_on) },
              absence.half_day && { label: t("hr.halfDay"), value: t("common.yes") },
              { label: t("hr.note"), value: absence.note },
            ]}
          />
        )
      )}
      {absence && canManage && (
        <form id="delete-absence" action={deleteAbsence} hidden>
          <input type="hidden" name="id" value={absence.id} />
          <input type="hidden" name="return" value={returnTo} />
        </form>
      )}
    </UrlSheet>
  )
}

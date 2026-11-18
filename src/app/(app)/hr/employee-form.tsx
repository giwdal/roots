import Link from "next/link"
import { Choice } from "@/components/choice"
import { DateInput } from "@/components/date-input"
import { FormCard } from "@/components/page"
import { RecordPicker, type PickerOption } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { T } from "@/i18n/translate"
import { EMPLOYMENT_TYPES, PAY_TYPES } from "@/hr/fields"
import { saveEmployee, searchEmployees, searchMembers } from "./actions"
import { PayFields } from "./pay-fields"

// A new person (/hr/new): role + contract, one form with one SaveBar. The org member is picked by search (name and
// email come from their profile; their shift-team member is linked by the action). On the person page each value is
// edited in place instead (patchEmployee).
export function EmployeeForm({ t, member }: { t: T; member?: PickerOption | null }) {
  const field = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid content-start gap-2">
      <Label htmlFor={`emp-${name}`}>{label}</Label>
      <Input id={`emp-${name}`} name={name} {...props} />
    </div>
  )
  const date = (name: string, label: string) => (
    <div className="grid content-start gap-2">
      <Label htmlFor={`emp-${name}`}>{label}</Label>
      <DateInput id={`emp-${name}`} name={name} type="date" />
    </div>
  )
  return (
    <form action={saveEmployee} className="grid gap-6">
      <FormCard id="role" title={t("hr.roleCard")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1 sm:col-span-2">
            <RecordPicker name="user_id" label={t("hr.member")} search={searchMembers} initial={member} required />
            <p className="text-xs text-muted-foreground">
              {t("hr.memberHint")}{" "}
              <Link href="/settings/team" className="text-[var(--link)] hover:underline">
                {t("hr.inviteLink")}
              </Link>
            </p>
          </div>
          {field("job_title", t("hr.jobTitle"), { maxLength: 100 })}
          {field("department", t("hr.department"), { maxLength: 100 })}
          <div className="grid content-start gap-2">
            <Label htmlFor="emp-phone">{t("hr.phone")}</Label>
            <TypedInput kind="phone" id="emp-phone" name="phone" />
          </div>
          <RecordPicker name="manager_id" label={t("hr.manager")} search={searchEmployees} placeholder={t("hr.noManager")} />
        </div>
      </FormCard>
      <FormCard id="contract" title={t("hr.contract")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2 sm:col-span-2">
            <Label htmlFor="emp-employment_type">{t("hr.employmentType")}</Label>
            <Choice id="emp-employment_type" name="employment_type" label={t("hr.employmentType")} required defaultValue="part_time" options={EMPLOYMENT_TYPES.map((x) => ({ value: x, label: t.dynamic(`hr.types.${x}`) }))} />
          </div>
          <PayFields labels={{ pay: t("hr.payType"), hourly: t("hr.hourlyRate"), monthly: t("hr.monthlySalary") }} options={PAY_TYPES.map((x) => ({ value: x, label: t.dynamic(`hr.payTypes.${x}`) }))} defaultType="hourly" hourly="" monthly="" />
          {date("starts_on", t("hr.startsOn"))}
          {date("ends_on", t("hr.endsOn"))}
          <div className="grid content-start gap-2">
            <Label htmlFor="emp-weekly_hours">{t("hr.weeklyHours")}</Label>
            <TypedInput kind="number" id="emp-weekly_hours" name="weekly_hours" min={0} max={80} step="any" />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="emp-vacation_days">{t("hr.vacationDays")}</Label>
            <TypedInput kind="number" id="emp-vacation_days" name="vacation_days" min={0} max={365} step="any" />
          </div>
        </div>
      </FormCard>
      <FormCard id="notes" title={t("hr.notes")}>
        <Textarea id="emp-notes" name="notes" rows={3} maxLength={5000} aria-label={t("hr.notes")} />
      </FormCard>
      <SaveBar label={t("hr.create")} always />
    </form>
  )
}

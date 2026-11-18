import Link from "next/link"
import { Choice } from "@/components/choice"
import { DateInput } from "@/components/date-input"
import { FormCard } from "@/components/page"
import { RecordPicker, type PickerOption } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { searchStaff } from "@/app/(app)/shifts/actions"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { T } from "@/i18n/translate"
import { EMPLOYMENT_TYPES, PAY_TYPES } from "@/hr/fields"
import type { Tables } from "@/lib/supabase/types"
import { priceInput } from "@/tickets/price"
import { saveEmployee, searchEmployees, searchMembers } from "./actions"
import { PayFields } from "./pay-fields"

type Employee = Tables<"employees">

// Role + contract of a person, one form with one SaveBar: on /hr/new (cards; pick the org member, name and email come
// from their profile) and in the person page's ?edit=details sheet (plain groups). Big pickers search on the server.
// `staff`: the linked shift-team member; `pickStaff` shows the picker (only for people who see the team).
export function EmployeeForm({ t, e, member, manager, staff, pickStaff, cards }: { t: T; e?: Employee | null; member?: PickerOption | null; manager?: PickerOption | null; staff?: PickerOption | null; pickStaff?: boolean; cards?: boolean }) {
  const group = (id: string, title: string, children: React.ReactNode) =>
    cards ? (
      <FormCard id={id} title={title}>
        {children}
      </FormCard>
    ) : (
      <section className="grid gap-3" aria-labelledby={`${id}-h`}>
        <h3 id={`${id}-h`} className="text-sm font-medium">
          {title}
        </h3>
        {children}
      </section>
    )
  const field = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid content-start gap-2">
      <Label htmlFor={`emp-${name}`}>{label}</Label>
      <Input id={`emp-${name}`} name={name} {...props} />
    </div>
  )
  const date = (name: string, label: string, value: string | null | undefined) => (
    <div className="grid content-start gap-2">
      <Label htmlFor={`emp-${name}`}>{label}</Label>
      <DateInput id={`emp-${name}`} name={name} type="date" defaultValue={value ?? ""} />
    </div>
  )
  return (
    <form action={saveEmployee} className="grid gap-6">
      {e && <input type="hidden" name="id" value={e.id} />}
      {e && <input type="hidden" name="name" value={e.name} />}
      {group(
        "role",
        t("hr.roleCard"),
        <div className="grid gap-4 sm:grid-cols-2">
          {!e && (
            <div className="grid gap-1 sm:col-span-2">
              <RecordPicker name="user_id" label={t("hr.member")} search={searchMembers} initial={member} required />
              <p className="text-xs text-muted-foreground">
                {t("hr.memberHint")}{" "}
                <Link href="/settings/team" className="text-[var(--link)] hover:underline">
                  {t("hr.inviteLink")}
                </Link>
              </p>
            </div>
          )}
          {field("job_title", t("hr.jobTitle"), { maxLength: 100, defaultValue: e?.job_title ?? "" })}
          {field("department", t("hr.department"), { maxLength: 100, defaultValue: e?.department ?? "" })}
          <div className="grid content-start gap-2">
            <Label htmlFor="emp-phone">{t("hr.phone")}</Label>
            <TypedInput kind="phone" id="emp-phone" name="phone" defaultValue={e?.phone ?? ""} />
          </div>
          <RecordPicker name="manager_id" label={t("hr.manager")} search={searchEmployees} initial={manager} placeholder={t("hr.noManager")} />
          {pickStaff && (
            <div className="grid gap-1 sm:col-span-2">
              <RecordPicker name="staff_id" label={t("hr.shiftTeam")} search={searchStaff.bind(null, "")} initial={staff} placeholder={t("hr.noShiftTeam")} />
              <p className="text-xs text-muted-foreground">{t("hr.shiftTeamHint")}</p>
            </div>
          )}
        </div>,
      )}
      {group(
        "contract",
        t("hr.contract"),
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2 sm:col-span-2">
            <Label htmlFor="emp-employment_type">{t("hr.employmentType")}</Label>
            <Choice id="emp-employment_type" name="employment_type" label={t("hr.employmentType")} required defaultValue={e?.employment_type ?? "part_time"} options={EMPLOYMENT_TYPES.map((x) => ({ value: x, label: t.dynamic(`hr.types.${x}`) }))} />
          </div>
          <PayFields
            labels={{ pay: t("hr.payType"), hourly: t("hr.hourlyRate"), monthly: t("hr.monthlySalary") }}
            options={PAY_TYPES.map((x) => ({ value: x, label: t.dynamic(`hr.payTypes.${x}`) }))}
            defaultType={e?.pay_type ?? "hourly"}
            hourly={e?.hourly_rate_cents != null ? priceInput(e.hourly_rate_cents) : ""}
            monthly={e?.monthly_salary_cents != null ? priceInput(e.monthly_salary_cents) : ""}
          />
          {date("starts_on", t("hr.startsOn"), e?.starts_on)}
          {date("ends_on", t("hr.endsOn"), e?.ends_on)}
          <div className="grid content-start gap-2">
            <Label htmlFor="emp-weekly_hours">{t("hr.weeklyHours")}</Label>
            <TypedInput kind="number" id="emp-weekly_hours" name="weekly_hours" min={0} max={80} step="any" defaultValue={e?.weekly_hours ?? ""} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="emp-vacation_days">{t("hr.vacationDays")}</Label>
            <TypedInput kind="number" id="emp-vacation_days" name="vacation_days" min={0} max={365} step="any" defaultValue={e?.vacation_days ?? ""} />
          </div>
        </div>,
      )}
      {group("notes", t("hr.notes"), <Textarea id="emp-notes" name="notes" rows={3} maxLength={5000} defaultValue={e?.notes ?? ""} aria-label={t("hr.notes")} />)}
      <SaveBar label={e ? undefined : t("hr.create")} always={!e} />
    </form>
  )
}

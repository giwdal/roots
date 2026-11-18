import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarClockIcon, ClockIcon, ContactIcon, LinkIcon, LockIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { DateInput } from "@/components/date-input"
import { DetailList } from "@/components/detail-list"
import { FileList } from "@/components/file-list"
import { InlineField } from "@/components/inline-field"
import { LinkRows, type LinkRow } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { RecordPicker } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { AddLink, Section } from "@/components/section"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { EMPLOYMENT_TYPES, PAY_TYPES, TAX_CLASSES } from "@/hr/fields"
import { absenceDays, vacationTaken } from "@/hr/pay"
import { payrollMonth } from "@/hr/server"
import { requirePerm } from "@/lib/context"
import { monthOf } from "@/lib/time"
import { param, withParams } from "@/lib/url"
import { linkStaff, patchEmployee, restoreEmployee, saveEmployeeLinks, savePrivate, searchEmployees, trashEmployee } from "../actions"
import { searchStaff } from "../../shifts/actions"
import { AbsenceSheet } from "../absence-sheet"
import { priceInput } from "@/tickets/price"

const UUID = /^[0-9a-f-]{36}$/

// Personal › Person (record page, patterns.md §8): identity + Stats (holiday left, sick days, this month's hours and
// gross); main column = absences, hours & pay, personal data; right rail = Eigenschaften (each value edited in place,
// patchEmployee), Zuordnung (?edit=links), Verknüpft, Dokumente. Sheets: ?edit=private (personal data, a compound
// value), ?edit=links (manager + shift team), ?new=absence / ?edit=<absence id>.
export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const ctx = await requirePerm("hr.view")
  if (!UUID.test(id)) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("hr.manage")
  const year = new Date().getFullYear()
  const month = monthOf()
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const seesTeam = ctx.modules.has("shifts") && ctx.can("shifts.view")
  const [{ data: e }, { data: priv }, { data: absences }, payroll] = await Promise.all([
    ctx.supabase.from("employees").select("*, manager:manager_id(id, name)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    canManage ? ctx.supabase.from("employee_private").select("*").eq("employee_id", id).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.supabase.from("absences").select("id, kind, starts_on, ends_on, half_day, note, employee_id").eq("employee_id", id).eq("org_id", ctx.org.id).gte("ends_on", `${year}-01-01`).order("starts_on", { ascending: false }),
    payrollMonth(ctx.supabase, ctx.org.id, month),
  ])
  if (!e) notFound()
  // The person's other records: their contact (same account) and their shift-team member (linked, or one to link).
  const [{ data: contact }, { data: staff }] = await Promise.all([
    e.user_id && ctx.modules.has("crm") && ctx.can("crm.view") ? ctx.supabase.from("contacts").select("id").eq("org_id", ctx.org.id).eq("user_id", e.user_id).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
    seesTeam && (e.staff_id || e.user_id)
      ? ctx.supabase.from("staff").select("id, name, active").eq("org_id", ctx.org.id).eq(e.staff_id ? "id" : "user_id", (e.staff_id ?? e.user_id)!).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const manager = e.manager as { id: string; name: string } | null
  const pay = payroll.find((p) => p.employee_id === id)
  const taken = vacationTaken(absences ?? [], year)
  const sick = (absences ?? []).filter((a) => a.kind === "sick").reduce((s, a) => s + absenceDays(a, `${year}-01-01`, `${year}-12-31`), 0)
  const day = (v: string) => t.date(v, { dateStyle: "medium" })
  const editParam = param(sp, "edit")
  const editingAbsence = editParam && UUID.test(editParam) ? (absences ?? []).find((a) => a.id === editParam) : undefined
  const left = e.ends_on && e.ends_on < today
  const notYet = e.starts_on && e.starts_on > today
  const here = `/hr/${id}`
  const sheetOpen = !!editingAbsence || param(sp, "new") === "absence" || editParam === "links" || editParam === "private"
  const hoursStat = pay && e.staff_id ? t.number(pay.approved_minutes / 60, { maximumFractionDigits: 1 }) : null
  const tel = e.phone?.replace(/[^\d+]/g, "")
  const linked: LinkRow[] = [
    ...(contact ? [{ key: "contact", icon: ContactIcon, href: `/contacts/${contact.id}`, title: t("hr.contactRecord"), detail: e.email ?? undefined }] : []),
    ...(staff && e.staff_id ? [{ key: "staff", icon: CalendarClockIcon, href: ctx.can("shifts.manage") ? `/shifts/team?edit=${staff.id}` : "/shifts/team", title: t("hr.shiftTeam"), detail: staff.name, badge: !staff.active && <Badge variant="secondary">{t("shifts.inactive")}</Badge> }] : []),
    ...(staff && e.staff_id ? [{ key: "hours", icon: ClockIcon, href: `/shifts/hours/${staff.id}`, title: t("shifts.tabs.hours"), detail: t.date(`${month.month}-15T12:00:00Z`, { month: "long", year: "numeric" }) }] : []),
  ]
  const privField = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid content-start gap-2">
      <Label htmlFor={`p-${name}`}>{label}</Label>
      <Input id={`p-${name}`} name={name} defaultValue={(priv as Record<string, string | null> | null)?.[name] ?? ""} {...props} />
    </div>
  )


  // Eigenschaften: every single value is edited where it is shown (hr.manage); patchEmployee checks it like the form.
  const prop = (field: string, label: string, value: string | null, opts: { kind?: React.ComponentProps<typeof InlineField>["kind"]; display?: React.ReactNode; options?: { value: string; label: string }[] } = {}) => ({
    label,
    value: canManage ? <InlineField action={patchEmployee} id={e.id} field={field} value={value} label={label} {...opts} /> : (opts.display ?? value),
  })
  const link = (href: string, text: string) => (
    <a href={href} className="link">
      {text}
    </a>
  )

  const properties = (
    <>
      <Section id="properties" title={t("hr.properties")}>
        <DetailList
          items={[
            prop("employment_type", t("hr.employmentType"), e.employment_type, { kind: "choice", options: EMPLOYMENT_TYPES.map((x) => ({ value: x, label: t.dynamic(`hr.types.${x}`) })), display: t.dynamic(`hr.types.${e.employment_type}`) }),
            prop("pay_type", t("hr.payType"), e.pay_type, { kind: "choice", options: PAY_TYPES.map((x) => ({ value: x, label: t.dynamic(`hr.payTypes.${x}`) })), display: t.dynamic(`hr.payTypes.${e.pay_type}`) }),
            e.pay_type === "hourly" && prop("hourly_rate", t("hr.hourlyRate"), e.hourly_rate_cents != null ? priceInput(e.hourly_rate_cents) : null, { kind: "money", display: e.hourly_rate_cents != null && `${t.money(e.hourly_rate_cents)}/h` }),
            e.pay_type === "monthly" && prop("monthly_salary", t("hr.monthlySalary"), e.monthly_salary_cents != null ? priceInput(e.monthly_salary_cents) : null, { kind: "money", display: e.monthly_salary_cents != null && t.money(e.monthly_salary_cents) }),
            prop("weekly_hours", t("hr.weeklyHours"), e.weekly_hours != null ? String(e.weekly_hours) : null, { kind: "number", display: e.weekly_hours != null && `${t.number(Number(e.weekly_hours))} h` }),
            prop("vacation_days", t("hr.vacationDays"), e.vacation_days != null ? String(e.vacation_days) : null, { kind: "number", display: e.vacation_days != null && t.number(Number(e.vacation_days)) }),
            prop("starts_on", t("hr.startsOn"), e.starts_on, { kind: "date", display: e.starts_on && day(e.starts_on) }),
            prop("ends_on", t("hr.endsOn"), e.ends_on, { kind: "date", display: e.ends_on && day(e.ends_on) }),
            prop("job_title", t("hr.jobTitle"), e.job_title),
            prop("department", t("hr.department"), e.department),
            prop("phone", t("hr.phone"), e.phone, { kind: "phone", display: e.phone && tel && link(`tel:${tel}`, e.phone) }),
            { label: t("hr.account"), value: e.email && link(`mailto:${e.email}`, e.email) },
            prop("notes", t("hr.notes"), e.notes, { kind: "textarea", display: e.notes && <span className="whitespace-pre-line">{e.notes}</span> }),
          ]}
        />
      </Section>
      <Section
        id="assignment"
        title={t("hr.assignment")}
        action={
          canManage && (
            <Link href={withParams(sp, { edit: "links", new: undefined })} scroll={false} className="text-sm link">
              {t("hr.change")}
            </Link>
          )
        }
      >
        <DetailList
          items={[
            { label: t("hr.manager"), value: manager ? <Link href={`/hr/${manager.id}`} className="link">{manager.name}</Link> : null },
            ctx.modules.has("shifts") && { label: t("hr.shiftTeam"), value: e.staff_id ? (staff?.name ?? t("hr.linkedHidden")) : t("hr.noShiftTeam") },
          ]}
        />
      </Section>
    </>
  )

  const pay_ = (
    <Section id="pay" title={t("hr.hoursPay")}>
      {e.staff_id && pay ? (
        <div className="grid gap-2 text-sm">
          <p>
            {t("hr.approvedHours", { hours: t.number(pay.approved_minutes / 60, { maximumFractionDigits: 2 }) })}
            {pay.gross_cents != null && ` · ${t("hr.gross", { amount: t.money(pay.gross_cents) })}`}
          </p>
          {pay.unapproved_entries > 0 &&
            (seesTeam ? (
              <Link href={`/shifts/hours/${e.staff_id}`} className="text-xs link">
                {t("hr.unapproved", { count: pay.unapproved_entries })}
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">{t("hr.unapproved", { count: pay.unapproved_entries })}</p>
            ))}
          {pay.warnings.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {pay.warnings.map((w) => (
                <Badge key={w} variant="destructive">
                  {t.dynamic(`hr.payWarnings.${w}`)}
                </Badge>
              ))}
            </span>
          )}
        </div>
      ) : (
        <div className="grid gap-2 text-sm">
          <p className="text-muted-foreground">{pay?.gross_cents != null ? t("hr.gross", { amount: t.money(pay.gross_cents) }) : t("hr.noHours")}</p>
          {/* Not linked yet: link the team member of the same account, or put the person on the team. */}
          {canManage && staff && !e.staff_id && (
            <form action={linkStaff}>
              <input type="hidden" name="id" value={e.id} />
              <SubmitButton size="sm" variant="outline">
                <LinkIcon /> {t("hr.linkStaff", { name: staff.name })}
              </SubmitButton>
            </form>
          )}
          {!staff && !e.staff_id && e.user_id && ctx.modules.has("shifts") && ctx.can("shifts.manage") && (
            <Button render={<Link href={`/shifts/team?new=staff&user=${e.user_id}`} />} nativeButton={false} size="sm" variant="outline" className="justify-self-start">
              <PlusIcon /> {t("hr.addToTeam")}
            </Button>
          )}
        </div>
      )}
    </Section>
  )

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/hr", label: t("hr.tabs.people") }, { label: e.name }]}
        title={e.name}
        badge={e.deleted_at ? <Badge variant="destructive">{t("hr.trash")}</Badge> : left ? <Badge variant="secondary">{t("hr.left")}</Badge> : notYet ? <Badge variant="info">{t("hr.startsAt", { date: day(e.starts_on!) })}</Badge> : <Badge variant="success">{t("hr.active")}</Badge>}
        meta={[t.dynamic(`hr.types.${e.employment_type}`), e.job_title, e.department].filter(Boolean).join(" · ")}
        menu={
          canManage &&
          !e.deleted_at && (
            <ActionsMenu>
              <MenuLink href={withParams(sp, { edit: "private", new: undefined })} icon={<LockIcon />}>
                {t("hr.editPrivate")}
              </MenuLink>
              <MenuSeparator />
              <MenuSubmit form="trash-employee" icon={<Trash2Icon />} destructive>
                {t("hr.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
        primary={canManage && !e.deleted_at ? { href: withParams(sp, { new: "absence", edit: undefined }), label: t("hr.addAbsence") } : undefined}
      />
      {canManage && !e.deleted_at && (
        <form id="trash-employee" action={trashEmployee} hidden>
          <input type="hidden" name="id" value={e.id} />
        </form>
      )}
      <Notice error={!sheetOpen ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      {e.deleted_at ? (
        <div className="grid max-w-xl gap-3">
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("hr.inTrash")}</p>
          {canManage && (
            <form action={restoreEmployee}>
              <input type="hidden" name="id" value={e.id} />
              <SubmitButton>{t("hr.restore")}</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <>
          <Stats>
            <Stat label={t("hr.vacationLeftStat", { year })} value={e.vacation_days != null ? t("hr.days", { count: Number(e.vacation_days) - taken }) : "–"} hint={e.vacation_days != null ? t("hr.ofDays", { total: t.number(Number(e.vacation_days)) }) : undefined} />
            <Stat label={t("hr.sickStat", { year })} value={t("hr.days", { count: sick })} />
            <Stat label={t("hr.hoursStat", { month: t.date(`${month.month}-15T12:00:00Z`, { month: "long" }) })} value={hoursStat != null ? `${hoursStat} h` : "–"} hint={pay?.unapproved_entries ? t("time.toApprove", { count: pay.unapproved_entries }) : undefined} href={e.staff_id && seesTeam ? `/shifts/hours/${e.staff_id}` : undefined} />
            <Stat label={t("hr.grossStat")} value={pay?.gross_cents != null ? t.money(pay.gross_cents) : "–"} href="/hr/payroll" tone={pay?.warnings.length ? "warn" : undefined} />
          </Stats>
          {/* patterns.md §8: desktop = main column + right rail (Eigenschaften on top, then Verknüpft, Dokumente);
              phones and tablets = one column: Eigenschaften → main sections → Verknüpft → Dokumente. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
            <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-1">{properties}</aside>
            <div className="grid min-w-0 content-start gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <Section id="absences" title={t("hr.absencesYear", { year })} action={<Link href={`/hr/absences?person=${e.id}`} className="text-sm link">{t("hr.inCalendar")}</Link>}>
                {(absences ?? []).length > 0 ? (
                  <ul className="grid divide-y rounded-lg border">
                    {(absences ?? []).map((a) => (
                      <li key={a.id}>
                        <Link href={withParams(sp, { edit: a.id, new: undefined })} scroll={false} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm hover:bg-muted active:bg-muted">
                          <span className="grid min-w-0 flex-1">
                            <span className="font-medium">{t.dynamic(`hr.kinds.${a.kind}`)}</span>
                            <span className="truncate text-xs text-muted-foreground">{[a.starts_on === a.ends_on ? day(a.starts_on) : `${day(a.starts_on)} – ${day(a.ends_on)}`, a.note].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">{t("hr.days", { count: absenceDays(a) })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("hr.noAbsences")}</p>
                )}
                {canManage && <AddLink href={withParams(sp, { new: "absence", edit: undefined })}>{t("hr.addAbsence")}</AddLink>}
              </Section>
              {pay_}
              {canManage && (
                <Section
                  id="private"
                  title={t("hr.private")}
                  description={t("hr.privateHint")}
                  action={
                    <Link href={withParams(sp, { edit: "private", new: undefined })} scroll={false} className="text-sm link">
                      {t("hr.change")}
                    </Link>
                  }
                >
                  <DetailList
                    items={[
                      { label: t("hr.birthday"), value: priv?.birthday && day(priv.birthday) },
                      { label: t("hr.address"), value: [priv?.street, [priv?.postal_code, priv?.city].filter(Boolean).join(" "), priv?.country && priv.country !== "DE" ? priv.country : null].filter(Boolean).join(", ") },
                      { label: t("hr.nationality"), value: priv?.nationality },
                      { label: t("hr.emergencyContact"), value: priv?.emergency_contact },
                      { label: t("hr.iban"), value: priv?.iban && <span className="font-mono">{priv.iban.replace(/(.{4})/g, "$1 ").trim()}</span> },
                      { label: t("hr.taxId"), value: priv?.tax_id && <span className="font-mono">{priv.tax_id}</span> },
                      { label: t("hr.taxClass"), value: priv?.tax_class },
                      { label: t("hr.socialSecurityNo"), value: priv?.social_security_no },
                      { label: t("hr.healthInsurance"), value: priv?.health_insurance },
                    ]}
                  />
                </Section>
              )}
            </div>
            <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-2">
              {linked.length > 0 && (
                <Section id="linked" title={t("shifts.linked")}>
                  <LinkRows rows={linked} />
                </Section>
              )}
              <FileList ctx={ctx} entity="employees" entityId={e.id} back={`/hr/${e.id}#files`} />
            </aside>
          </div>
        </>
      )}

      {canManage && !e.deleted_at && editParam === "links" && (
        <UrlSheet params={["edit"]} title={t("hr.assignment")} meta={e.name}>
          <Notice error={param(sp, "error")} />
          <form action={saveEmployeeLinks} className="grid gap-4">
            <input type="hidden" name="id" value={e.id} />
            <RecordPicker name="manager_id" label={t("hr.manager")} search={searchEmployees} initial={manager ? { id: manager.id, label: manager.name } : null} placeholder={t("hr.noManager")} />
            {seesTeam && (
              <div className="grid gap-1">
                <RecordPicker name="staff_id" label={t("hr.shiftTeam")} search={searchStaff.bind(null, "")} initial={staff && e.staff_id ? { id: staff.id, label: staff.name } : null} placeholder={t("hr.noShiftTeam")} />
                <p className="text-xs text-muted-foreground">{t("hr.shiftTeamHint")}</p>
              </div>
            )}
            <SaveBar />
          </form>
        </UrlSheet>
      )}
      {canManage && !e.deleted_at && editParam === "private" && (
        <UrlSheet params={["edit"]} title={t("hr.private")} meta={t("hr.privateHint")}>
          <Notice error={param(sp, "error")} />
          <form action={savePrivate} className="grid gap-6">
            <input type="hidden" name="employee_id" value={e.id} />
            <section className="grid gap-4 sm:grid-cols-2" aria-label={t("hr.private")}>
              <div className="grid content-start gap-2">
                <Label htmlFor="p-birthday">{t("hr.birthday")}</Label>
                <DateInput id="p-birthday" name="birthday" type="date" defaultValue={priv?.birthday ?? ""} />
              </div>
              {privField("nationality", t("hr.nationality"), { maxLength: 60 })}
              <div className="sm:col-span-2">{privField("street", t("hr.street"), { maxLength: 200, autoComplete: "off" })}</div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 sm:col-span-2">
                <div className="grid content-start gap-2">
                  <Label htmlFor="p-postal_code">{t("hr.postalCode")}</Label>
                  <TypedInput kind="postcode" id="p-postal_code" name="postal_code" country={priv?.country} defaultValue={priv?.postal_code ?? ""} autoComplete="off" />
                </div>
                {privField("city", t("hr.city"), { maxLength: 100, autoComplete: "off" })}
              </div>
              {privField("country", t("hr.country"), { maxLength: 2, placeholder: "DE", className: "max-w-20 uppercase" })}
              {privField("emergency_contact", t("hr.emergencyContact"), { maxLength: 300 })}
            </section>
            <section className="grid gap-4" aria-labelledby="p-bank">
              <h3 id="p-bank" className="text-sm font-medium">
                {t("hr.bankTax")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <div className="grid content-start gap-2">
                  <Label htmlFor="p-iban">{t("hr.iban")}</Label>
                  <TypedInput kind="iban" id="p-iban" name="iban" defaultValue={priv?.iban ?? ""} />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="p-bic">{t("hr.bic")}</Label>
                  <TypedInput kind="bic" id="p-bic" name="bic" defaultValue={priv?.bic ?? ""} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {privField("tax_id", t("hr.taxId"), { inputMode: "numeric", maxLength: 14, autoComplete: "off", className: "font-mono" })}
                <div className="grid content-start gap-2">
                  <Label htmlFor="p-tax_class">{t("hr.taxClass")}</Label>
                  <Choice id="p-tax_class" name="tax_class" label={t("hr.taxClass")} defaultValue={priv?.tax_class} options={TAX_CLASSES.map((c) => ({ value: c, label: c }))} />
                </div>
                {privField("social_security_no", t("hr.socialSecurityNo"), { maxLength: 20, autoComplete: "off" })}
                {privField("health_insurance", t("hr.healthInsurance"), { maxLength: 100 })}
              </div>
            </section>
            <SaveBar />
          </form>
        </UrlSheet>
      )}
      {!e.deleted_at && (editingAbsence || (canManage && param(sp, "new") === "absence")) && (
        <AbsenceSheet t={t} absence={editingAbsence} employee={{ id: e.id, name: e.name }} canManage={canManage} returnTo={here} error={param(sp, "error")} />
      )}
    </Page>
  )
}

export const instant = false

import Link from "next/link"
import { notFound } from "next/navigation"
import { BanIcon, BellIcon, CheckIcon, ContactIcon, IdCardIcon, LandmarkIcon, PauseIcon, PencilIcon, PlayIcon, RotateCcwIcon, Trash2Icon, Undo2Icon, UserRoundIcon, LogOutIcon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { customDetails } from "@/components/custom-field-details"
import { customInlineItems } from "@/components/custom-field-inline"
import { DetailList } from "@/components/detail-list"
import { InlineField } from "@/components/inline-field"
import { FileList } from "@/components/file-list"
import { LinkRows } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { Page, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Section } from "@/components/section"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { contactName } from "@/app/(app)/contacts/fields"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields, type FieldDef } from "@/lib/custom-fields"
import type { Tables } from "@/lib/supabase/types"
import { param, withParams, type SearchParams } from "@/lib/url"
import { earliestEnd, INTERVALS, paidUntil, type Interval } from "@/members/dues"
import { PAYMENT_METHODS } from "@/members/server"
import { IdCard } from "@/members/id-card"
import { DueBadge, isOverdueDue, MemberStateBadge, memberState } from "../badges"
import { DateField, Field, MandateFields, MembershipFields, TYPE_COLS, type Type } from "../membership-parts"
import { bulkDues, endMembership, patchMembership, pauseMembership, resetMemberCode, restoreMembership, resumeMembership, saveMembership, saveMembershipBank, sendReminders, setDueStatus, trashMembership } from "../actions"

type Ctx = Awaited<ReturnType<typeof requirePerm>>
type Contact = { id: string; first_name: string | null; last_name: string | null; company: string | null; email: string | null; phone: string | null; member_code: string | null }
type Due = { id: string; description: string; amount_cents: number; due_on: string; status: string; run_id: string | null; failed_at: string | null; reminders: number; reminded_at: string | null }
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

// One membership, opened on its state: badge, Stats (open, paid until, since, fee) and the next step as the main
// button (mark the oldest open due paid, or collect it by direct debit). Then the dues with their row actions and the
// membership's facts; editing, pausing and cancelling happen in sheets (?edit=details, ?new=pause, ?new=cancel).
async function MembershipBody({ t, ctx, m, types, defs, sp, canManage }: { t: T; ctx: Ctx; m: Tables<"memberships"> & { contacts: Contact | null }; types: Type[]; defs: FieldDef[]; sp: SearchParams; canManage: boolean }) {
  const [{ data: dues }, { data: others }] = await Promise.all([
    ctx.supabase
      .from("member_dues")
      .select("id, kind, period_start, description, amount_cents, due_on, status, paid_on, run_id, failed_at, reminders, reminded_at")
      .eq("org_id", ctx.org.id)
      .eq("membership_id", m.id)
      .order("due_on", { ascending: false })
      .limit(100),
    ctx.supabase.from("memberships").select("id, starts_on, ends_on, paused_from, paused_until, member_no, membership_types(name)").eq("org_id", ctx.org.id).eq("contact_id", m.contact_id).neq("id", m.id).is("deleted_at", null).order("starts_on", { ascending: false }).limit(10),
  ])
  const now = today()
  const type = types.find((x) => x.id === m.type_id)
  const interval = (m.fee_interval ?? type?.interval ?? "none") as Interval
  // "Bezahlt bis": end of the last paid period fee without gaps.
  const until = paidUntil(dues ?? [], interval)
  const here = `/members/${m.id}`
  const name = m.contacts ? contactName(m.contacts) : ""
  const active = canManage && !m.deleted_at
  const state = memberState(m, now)
  const open = (dues ?? []).filter((d) => d.status === "open")
  const owed = open.reduce((s, d) => s + d.amount_cents, 0)
  const overdue = open.filter((d) => isOverdueDue(d, now))
  const remindable = overdue.filter((d) => !d.run_id)
  const next = [...open].filter((d) => !d.run_id).sort((a, b) => a.due_on.localeCompare(b.due_on))[0]
  // Paid by direct debit: a mandate and SEPA chosen (or left automatic). Then the next step is the SEPA run.
  const bySepa = !!m.iban && (m.payment_method === "sepa" || !m.payment_method)
  const pausedNow = !!m.paused_from && (!m.paused_until || m.paused_until >= now)
  const fee = m.fee_cents ?? type?.fee_cents ?? 0
  const sheet = param(sp, "edit") === "details" ? "edit" : param(sp, "edit") === "bank" ? "bank" : (["pause", "cancel"] as const).find((x) => x === param(sp, "new"))
  const editHref = withParams(sp, { edit: "details", new: undefined })
  const bankHref = withParams(sp, { edit: "bank", new: undefined })
  const amountOf = (d: Due) => t.money(d.amount_cents)

  const primary = !active ? undefined : next && bySepa ? (
    { href: "/members/dues?new=sepa", label: t("membership.collectSepa"), icon: LandmarkIcon }
  ) : next ? (
    <form action={setDueStatus}>
      <input type="hidden" name="id" value={next.id} />
      <input type="hidden" name="status" value="paid" />
      <input type="hidden" name="back" value={here} />
      <SubmitButton size="sm" data-confirm="membership.confirmPaid" data-confirm-amount={amountOf(next)}>
        <CheckIcon /> {t("membership.markDuePaid", { amount: amountOf(next) })}
      </SubmitButton>
    </form>
  ) : undefined
  // Single values edit in place (InlineField + patchMembership); the bank details are one compound value → ?edit=bank.
  const prop = (field: string, label: string, value: string | null, opts: Omit<React.ComponentProps<typeof InlineField>, "action" | "id" | "field" | "value" | "label"> = {}) => ({
    label,
    value: <InlineField action={patchMembership} id={m.id} field={field} value={value} label={label} disabled={!active} {...opts} />,
  })
  const typeInterval = (type?.interval ?? "none") as Interval
  const properties = [
    prop("type_id", t("membership.type"), m.type_id, { kind: "choice", options: types.map((x) => ({ value: x.id, label: x.name })) }),
    prop("starts_on", t("membership.since"), m.starts_on, { kind: "date", display: t.date(m.starts_on) }),
    m.ends_on && { label: t("membership.until"), value: t.date(m.ends_on) },
    m.paused_from &&
      (!m.paused_until || m.paused_until >= now) && {
        label: t("membership.pause"),
        value: [m.paused_until ? t("membership.pausedRange", { from: t.date(m.paused_from), until: t.date(m.paused_until) }) : t("membership.pausedOpen", { from: t.date(m.paused_from) }), m.pause_reason].filter(Boolean).join(" · "),
      },
    prop("fee", t("membership.feeOwn"), m.fee_cents != null ? (m.fee_cents / 100).toFixed(2).replace(".", ",") : null, {
      kind: "money",
      display: m.fee_cents != null ? t.money(m.fee_cents) : undefined,
      emptyLabel: t("membership.typeDefault", { value: t.money(type?.fee_cents ?? 0) }),
    }),
    prop("fee_interval", t("membership.interval"), m.fee_interval, {
      kind: "choice",
      options: INTERVALS.map((i) => ({ value: i, label: t(`membership.intervals.${i}`) })),
      emptyLabel: t("membership.typeDefault", { value: t(`membership.intervals.${typeInterval}`) }),
    }),
    prop("payment_method", t("membership.paymentMethod"), m.payment_method, {
      kind: "choice",
      options: PAYMENT_METHODS.map((x) => ({ value: x, label: t.dynamic(`membership.paymentMethods.${x}`) })),
      emptyLabel: m.iban ? t("membership.paymentAutoSepa") : t("membership.paymentAutoTransfer"),
    }),
    prop("fee_free_until", t("membership.feeFreeUntil"), m.fee_free_until, { kind: "date", display: m.fee_free_until ? t.date(m.fee_free_until) : undefined }),
    {
      label: "IBAN",
      value: active ? (
        <Link href={bankHref} scroll={false} className="-mx-2 block rounded-md px-2 py-1 hover:bg-muted/60" aria-label={t("common.editField", { field: "IBAN" })}>
          {m.iban ? <span className="font-mono text-xs">{m.iban.replace(/(.{4})/g, "$1 ").trim()}</span> : <span className="text-muted-foreground">{t("common.emptyValue")}</span>}
        </Link>
      ) : (
        m.iban && <span className="font-mono text-xs">{m.iban.replace(/(.{4})/g, "$1 ").trim()}</span>
      ),
    },
    m.iban && m.account_holder && { label: t("membership.accountHolder"), value: m.account_holder },
    m.iban && { label: t("membership.mandateRef"), value: m.mandate_ref },
    m.iban && { label: t("membership.mandateSigned"), value: m.mandate_signed_on && t.date(m.mandate_signed_on) },
    ...(active ? customInlineItems(t, defs, m.custom, patchMembership, m.id) : customDetails(t, defs, m.custom)),
    prop("note", t("membership.note"), m.note, { kind: "textarea", display: m.note ? <span className="whitespace-pre-line">{m.note}</span> : undefined }),
  ]

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/members", label: t("membership.nav") }, { label: name }]}
        title={name}
        badge={m.deleted_at ? <Badge variant="destructive">{t("membership.filters.trash")}</Badge> : <MemberStateBadge t={t} m={m} now={now} />}
        meta={[m.member_no && t("membership.numberShort", { number: m.member_no }), type?.name].filter(Boolean).join(" · ")}
        actions={
          <>
            {m.contacts && (
              <Button render={<Link href={`/contacts/${m.contacts.id}`} />} nativeButton={false} size="sm" variant="outline">
                <ContactIcon /> {t("membership.openContact")}
              </Button>
            )}
          </>
        }
        menu={
          active && (
            <ActionsMenu>
              <MenuLink href={editHref} icon={<PencilIcon />}>
                {t("common.editAll")}
              </MenuLink>
              {state !== "ended" &&
                (pausedNow ? (
                  <MenuSubmit form="resume-membership" icon={<PlayIcon />}>
                    {t("membership.resume")}
                  </MenuSubmit>
                ) : (
                  <MenuLink href={withParams(sp, { new: "pause", edit: undefined })} icon={<PauseIcon />}>
                    {t("membership.pause")}
                  </MenuLink>
                ))}
              {!m.ends_on && type && (
                <MenuLink href={withParams(sp, { new: "cancel", edit: undefined })} icon={<LogOutIcon />}>
                  {t("membership.cancel")}
                </MenuLink>
              )}
              {!!remindable.length && (
                <MenuSubmit form="remind-member" icon={<BellIcon />} confirm="membership.confirmRemindMember">
                  {t("membership.remindMember")}
                </MenuSubmit>
              )}
              {m.contacts?.member_code && (
                <MenuSubmit form="reset-card" icon={<IdCardIcon />} confirm="membership.confirmCardReset">
                  {t("membership.cardReset")}
                </MenuSubmit>
              )}
              {!dues?.length && (
                <>
                  <MenuSeparator />
                  <MenuSubmit form="trash-membership" icon={<Trash2Icon />} destructive>
                    {t("membership.toTrash")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
        primary={primary}
      />
      {active && (
        <>
          <form id="resume-membership" action={resumeMembership} hidden>
            <input type="hidden" name="id" value={m.id} />
          </form>
          <form id="remind-member" action={bulkDues} hidden>
            {remindable.map((d) => (
              <input key={d.id} type="hidden" name="ids" value={d.id} />
            ))}
            <input type="hidden" name="intent" value="remind" />
            <input type="hidden" name="back" value={here} />
          </form>
          {m.contacts?.member_code && (
            <form id="reset-card" action={resetMemberCode} hidden>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="contact" value={m.contacts.id} />
            </form>
          )}
          {!dues?.length && (
            <form id="trash-membership" action={trashMembership} hidden>
              <input type="hidden" name="id" value={m.id} />
            </form>
          )}
        </>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {m.deleted_at && (
        <div className="grid max-w-xl gap-3">
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
            {t("membership.deletedOn", { date: t.date(m.deleted_at), purge: t.date(new Date(new Date(m.deleted_at).getTime() + 30 * 86_400_000)) })}
          </p>
          {canManage && (
            <form action={restoreMembership}>
              <input type="hidden" name="id" value={m.id} />
              <SubmitButton>{t("membership.restore")}</SubmitButton>
            </form>
          )}
        </div>
      )}

      <Stats>
        <Stat label={t("membership.statOpen")} value={t.money(owed)} hint={overdue.length ? t("membership.statOverdue", { count: overdue.length }) : open.length ? t("membership.statOpenCount", { count: open.length }) : undefined} tone={overdue.length ? "warn" : undefined} href="#dues" />
        <Stat label={t("membership.paidUntilCol")} value={until ? t.date(until) : "–"} />
        <Stat label={t("membership.since")} value={t.date(m.starts_on)} hint={m.ends_on ? t("membership.state.ending", { date: t.date(m.ends_on) }) : undefined} />
        <Stat
          label={t("membership.feeOwn")}
          value={fee === 0 && interval === "none" ? t("membership.feeNone") : `${t.money(fee)} / ${t(`membership.intervals.${interval}`)}`}
          hint={m.fee_free_until && m.fee_free_until >= now ? t("membership.feeFreeUntilShort", { date: t.date(m.fee_free_until) }) : undefined}
        />
      </Stats>

      <RecordLayout
        top={
          <Section id="details" title={t("common.properties")}>
            <DetailList items={properties} phoneLimit={5} />
          </Section>
        }
        aside={
          <>
            {m.contacts && (
              <Section id="person" title={t("membership.person")}>
                <LinkRows rows={[{ key: "contact", icon: UserRoundIcon, href: `/contacts/${m.contacts.id}`, title: name, detail: t("membership.openContact") }]} />
                <DetailList
                  items={[
                    m.contacts.email && {
                      label: t("contacts.email"),
                      value: (
                        <a href={`mailto:${m.contacts.email}`} className="break-all link">
                          {m.contacts.email}
                        </a>
                      ),
                    },
                    m.contacts.phone && {
                      label: t("contacts.phone"),
                      value: (
                        <a href={`tel:${m.contacts.phone.replace(/[^\d+]/g, "")}`} className="link">
                          {m.contacts.phone}
                        </a>
                      ),
                    },
                  ]}
                />
              </Section>
            )}
            {m.contacts?.member_code && !m.deleted_at && (
              <Section id="card" title={t("membership.card")} description={t("membership.cardHint")}>
                <IdCard t={t} org={ctx.org.name} name={name} number={m.member_no} type={type?.name ?? null} code={m.contacts.member_code} />
              </Section>
            )}
            {!!others?.length && (
              <Section id="periods" title={t("membership.otherMemberships")}>
                <LinkRows
                  rows={others.map((o) => ({
                    key: o.id,
                    icon: IdCardIcon,
                    href: `/members/${o.id}`,
                    title: [o.membership_types?.name ?? "–", o.member_no && t("membership.numberShort", { number: o.member_no })].filter(Boolean).join(" · "),
                    detail: `${t.date(o.starts_on)} – ${o.ends_on ? t.date(o.ends_on) : t("membership.open")}`,
                    badge: <MemberStateBadge t={t} m={o} now={now} />,
                  }))}
                />
              </Section>
            )}
            {ctx.can("org.files.view") && (
              <Section id="files" title={t("files.title")}>
                <FileList ctx={ctx} entity="memberships" entityId={m.id} back={here} hideTitle />
              </Section>
            )}
          </>
        }
      >
        <Section id="dues" title={t("membership.tabs.dues")}>
          {dues?.length ? (
            <ul className="grid divide-y rounded-lg border">
              {dues.map((d) => (
                <DueRow key={d.id} t={t} d={d} now={now} here={here} canManage={active} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("membership.noDues")}</p>
          )}
        </Section>

      </RecordLayout>

      {active && sheet === "edit" && (
        <UrlSheet params={["edit"]} title={name}>
          <form action={saveMembership} className="grid gap-6">
            <input type="hidden" name="id" value={m.id} />
            <MembershipFields t={t} types={types} m={m} defs={defs} />
            <SaveBar />
          </form>
        </UrlSheet>
      )}
      {active && sheet === "bank" && (
        <UrlSheet params={["edit"]} title={t("membership.mandate")} compact>
          <form action={saveMembershipBank} className="grid gap-4">
            <input type="hidden" name="id" value={m.id} />
            <p className="text-sm text-muted-foreground">{t("membership.mandateHint")}</p>
            <MandateFields t={t} m={m} />
            <SaveBar />
          </form>
        </UrlSheet>
      )}
      {active && sheet === "pause" && state !== "ended" && (
        <UrlSheet params={["new"]} title={t("membership.pause")}>
          <form action={pauseMembership} className="grid gap-4">
            <input type="hidden" name="id" value={m.id} />
            <p className="text-sm text-muted-foreground">{t("membership.pauseHint")}</p>
            <div className="grid grid-cols-2 gap-3">
              <DateField id="m-pause-from" name="paused_from" label={t("membership.pauseFrom")} defaultValue={today()} required />
              <DateField id="m-pause-until" name="paused_until" label={t("membership.pauseUntil")} />
            </div>
            <Field id="m-pause-reason" name="pause_reason" label={t("membership.pauseReason")} maxLength={300} />
            <SaveBar label={t("membership.pause")} always />
          </form>
        </UrlSheet>
      )}
      {active && sheet === "cancel" && !m.ends_on && type && (
        <UrlSheet params={["new"]} title={t("membership.cancel")}>
          <form action={endMembership} className="grid gap-4">
            <input type="hidden" name="id" value={m.id} />
            <p className="text-sm text-muted-foreground">{t("membership.cancelHint", { date: t.date(earliestEnd(today(), type.notice_months, type.interval as Interval)), months: type.notice_months })}</p>
            <DateField id="m-cancel" name="ends_on" label={t("membership.cancelOtherDate")} />
            <SaveBar label={t("membership.cancel")} always confirm="membership.confirmCancel" />
          </form>
        </UrlSheet>
      )}
    </Page>
  )
}

// One due: text + date, amount, status; the usual step (Bezahlt) as a button, the rest in the row's ⋯.
function DueRow({ t, d, now, here, canManage }: { t: T; d: Due; now: string; here: string; canManage: boolean }) {
  const form = (action: string) => `due-${d.id}-${action}`
  const status = (action: string, value: string) => (
    <form id={form(action)} action={setDueStatus} hidden>
      <input type="hidden" name="id" value={d.id} />
      <input type="hidden" name="status" value={value} />
      <input type="hidden" name="back" value={here} />
    </form>
  )
  const isOpen = d.status === "open"
  const remind = isOpen && isOverdueDue(d, now) && !d.run_id
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
      <span className="grid min-w-0 flex-1 basis-40">
        <span className="truncate font-medium">{d.description}</span>
        <span className="truncate text-xs text-muted-foreground">
          {[
            t("membership.dueOnShort", { date: t.date(d.due_on) }),
            isOpen && d.run_id && t("membership.inRun"),
            isOpen && d.reminded_at && t("membership.reminded", { count: d.reminders, date: t.date(d.reminded_at) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="font-medium tabular-nums">{t.money(d.amount_cents)}</span>
      <DueBadge t={t} d={d} now={now} />
      {canManage && (
        <span className="ml-auto flex items-center gap-1">
          {isOpen && !d.run_id && (
            <form action={setDueStatus}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="status" value="paid" />
              <input type="hidden" name="back" value={here} />
              <SubmitButton size="sm" variant="outline" data-confirm="membership.confirmPaid" data-confirm-amount={t.money(d.amount_cents)}>
                <CheckIcon /> {t("membership.markPaid")}
              </SubmitButton>
            </form>
          )}
          {(remind || (isOpen && !d.run_id) || d.status === "paid") && (
            <>
              {remind && (
                <form id={form("remind")} action={sendReminders} hidden>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="back" value={here} />
                </form>
              )}
              {isOpen && !d.run_id && status("cancel", "cancelled")}
              {d.status === "paid" && status("failed", "failed")}
              {d.status === "paid" && !d.run_id && status("open", "open")}
              <ActionsMenu>
                {remind && (
                  <MenuSubmit form={form("remind")} icon={<BellIcon />} confirm="membership.confirmRemindOne">
                    {t("membership.remind")}
                  </MenuSubmit>
                )}
                {d.status === "paid" && !d.run_id && (
                  <MenuSubmit form={form("open")} icon={<RotateCcwIcon />}>
                    {t("membership.markOpen")}
                  </MenuSubmit>
                )}
                {d.status === "paid" && (
                  <MenuSubmit form={form("failed")} icon={<Undo2Icon />} confirm="membership.confirmReturned">
                    {t("membership.markReturned")}
                  </MenuSubmit>
                )}
                {isOpen && !d.run_id && (
                  <MenuSubmit form={form("cancel")} icon={<BanIcon />} destructive confirm="membership.confirmCancelDue">
                    {t("membership.cancelDue")}
                  </MenuSubmit>
                )}
              </ActionsMenu>
            </>
          )}
        </span>
      )}
    </li>
  )
}

export default async function MembershipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("members.view")
  const t = await getT()
  const sp = await searchParams
  const [{ data: m }, { data: types }, defs] = await Promise.all([
    ctx.supabase.from("memberships").select("*, contacts(id, first_name, last_name, company, email, phone, member_code)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("membership_types").select(TYPE_COLS).eq("org_id", ctx.org.id).order("name"),
    loadFields(ctx.supabase, ctx.org.id, "memberships"),
  ])
  if (!m) notFound()
  return <MembershipBody t={t} ctx={ctx} m={m} types={types ?? []} defs={defs} sp={sp} canManage={ctx.can("members.manage")} />
}

export const instant = false

import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { BanIcon, CheckIcon, CreditCardIcon, FileTextIcon, FolderKanbanIcon, KeyRoundIcon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react"
import { ActionsMenu, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { ContactPicker } from "@/components/contact-picker"
import { customInlineItems } from "@/components/custom-field-inline"
import { customDetails } from "@/components/custom-field-details"
import { DateInput } from "@/components/date-input"
import { DetailList } from "@/components/detail-list"
import { FileList } from "@/components/file-list"
import { InlineField } from "@/components/inline-field"
import { LinkRows, type LinkRow } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { AddLink, Section } from "@/components/section"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getT } from "@/i18n/server"
import { readFields } from "@/letters/model"
import { contactVars, letterhead, loadTemplate } from "@/letters/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { formatMoney } from "@/lib/inputs"
import { toLocalInput } from "@/lib/time"
import { param, withParams } from "@/lib/url"
import { longTerm, noticeEnd, rentalState, termInfo, UNITS, wordFor, type Family } from "@/rentals/fields"
import { RENTAL_COLS } from "@/rentals/server"
import { contactName } from "../../../contacts/fields"
import { Composer } from "../../../files/templates/[id]/composer"
import { addPersonAction, giveNoticeAction, patchRental, removePersonAction, returnAction, saveTermAction, setRentalStatusAction, trashRentalAction } from "../../actions"
import { StateBadge } from "../../badges"
import { peopleLine, period } from "../../parts"
import { TermFields } from "../../term-fields"
import { ContractMenu } from "./contract-menu"

const UUID = /^[0-9a-f-]{36}$/

// One rental (Mietvertrag / Buchung / Ausleihe / Ausgabe), patterns.md §8: opens on its state (Stats: term, next
// deadline, rent, deposit) with the next step as primary (Bestätigen · Kündigung eintragen · Zurücknehmen); main =
// Laufzeit (?edit=term), Personen (?new=person, removing asks), keys handed out on it; right rail = Eigenschaften
// edited in place (patchRental), Verknüpft, Dateien. Status changes are actions (Stornieren asks). Contract:
// ?new=contract&template=<letter template>.
export default async function RentalPage({ params, searchParams }: PageProps<"/rentals/r/[id]">) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const sp = await searchParams
  const here = `/rentals/r/${id}`
  if (param(sp, "contract")) redirect(`${here}${withParams(sp, { contract: undefined, new: "contract", template: param(sp, "contract") })}`) // old link
  const ctx = await requirePerm("rentals.view")
  const t = await getT()
  const canManage = ctx.can("rentals.manage")
  const [{ data: r }, { data: handouts }, defs, { data: contracts }] = await Promise.all([
    ctx.supabase.from("rentals").select(`${RENTAL_COLS}, rental_objects(id, name, kind, family, parent_id), rental_rates(name)`).eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("rentals").select(`${RENTAL_COLS}, rental_objects(id, name, kind)`).eq("parent_id", id).eq("org_id", ctx.org.id).is("deleted_at", null).order("starts_at"),
    loadFields(ctx.supabase, ctx.org.id, "rentals"),
    // Contract templates = letter templates that use the rental's placeholders (own ones first).
    ctx.can("org.files.view")
      ? ctx.supabase.from("letter_templates").select("id, name, org_id").or(`org_id.is.null,org_id.eq.${ctx.org.id}`).is("deleted_at", null).ilike("body", "%{rental\\_%").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; org_id: string | null }[] }),
  ])
  if (!r || !r.rental_objects) notFound()
  const o = r.rental_objects
  const people = [...(r.rental_contacts ?? [])].sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
  const mainId = people.find((p) => p.role === "main")?.contact_id ?? null
  const seesInvoices = ctx.modules.has("invoices") && ctx.can("invoices.view")
  const seesPayments = ctx.modules.has("payments") && ctx.can("payments.view")
  const seesProjects = ctx.modules.has("projects") && ctx.can("projects.view")
  // ?new=contract&template=<id>: write the contract right here (sheet with live preview), for the main tenant + this rental.
  const templateId = param(sp, "new") === "contract" ? param(sp, "template") : undefined
  const [composer, { data: rates }, { data: projects }] = await Promise.all([
    templateId && mainId && ctx.can("org.files.view") && (contracts ?? []).some((c) => c.id === templateId)
      ? Promise.all([loadTemplate(ctx, templateId), letterhead(ctx), contactVars(ctx, t, mainId, id)]).then(([template, head, filled]) => (template ? { template, head, filled, contactId: mainId } : null))
      : Promise.resolve(null),
    ctx.supabase.from("rental_rates").select("id, name").eq("object_id", o.id).eq("org_id", ctx.org.id).order("position"),
    seesProjects ? ctx.supabase.from("project_links").select("projects(id, name)").eq("org_id", ctx.org.id).eq("entity", "rentals").eq("entity_id", id) : Promise.resolve({ data: [] }),
  ])
  const word = wordFor(o.family as Family, r.unit)
  const wordLabel = t.dynamic(`rentals.words.${word}`)
  const state = rentalState(r)
  const long = longTerm(r.unit)
  const editable = canManage && !r.deleted_at
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const berlinDay = (v: string) => new Date(v).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const dayText = (d: string) => t.date(`${d}T12:00:00Z`, { dateStyle: "medium" })
  const months = (n: number) => (n % 12 === 0 ? t("letters.years", { count: n / 12 }) : t("rentals.noticeMonthsText", { count: n }))
  const term = termInfo({ end: r.ends_at ? berlinDay(r.ends_at) : null, renew_months: r.renew_months, notice_months: r.notice_months, noticeGiven: !!r.notice_at }, today)
  const started = berlinDay(r.starts_at) <= today
  const timed = (v: string) => t.date(v, long ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" })
  const dateValue = (v: string | null) => (v ? (long ? berlinDay(v) : toLocalInput(v)) : "")
  const canNotice = editable && long && !r.notice_at && state !== "ended" && r.status === "confirmed"

  // The next deadline of a long-term contract: notice deadline (renewing), the fixed end, or the earliest end.
  const deadline: { label: string; value: string; hint?: string } | null = !long
    ? null
    : r.notice_at && r.ends_at
      ? { label: t("rentals.endsStat"), value: dayText(berlinDay(r.ends_at)), hint: t("rentals.noticeReceived", { date: t.date(r.notice_at, { dateStyle: "medium" }) }) }
      : term.kind === "renew"
        ? { label: t("rentals.deadlineStat"), value: dayText(term.deadline), hint: t("rentals.termUntil", { date: dayText(term.termEnd) }) }
        : term.kind === "fixed"
          ? { label: t("rentals.endsStat"), value: dayText(term.end) }
          : { label: t("rentals.earliestStat"), value: term.earliest ? dayText(term.earliest) : "–", hint: t("rentals.term.open") }

  const termText = long
    ? [
        started ? t("rentals.term.since", { date: dayText(berlinDay(r.starts_at)) }) : t("rentals.term.from", { date: dayText(berlinDay(r.starts_at)) }),
        term.kind === "fixed"
          ? t("rentals.term.fixed", { date: dayText(term.end) })
          : term.kind === "renew"
            ? t("rentals.term.renew", { end: dayText(term.termEnd), renew: months(r.renew_months!) }) + (r.notice_months != null ? ` · ${t("rentals.term.deadline", { date: dayText(term.deadline) })}` : "")
            : term.earliest
              ? t("rentals.term.openNotice", { date: dayText(term.earliest) })
              : t("rentals.term.open"),
      ].join(" · ")
    : null

  // Eigenschaften: single values edited in place (rentals.manage), checked by patchRental like the form.
  const prop = (field: string, label: string, value: string | null, opts: { kind?: React.ComponentProps<typeof InlineField>["kind"]; display?: React.ReactNode; options?: { value: string; label: string }[] } = {}) => ({
    label,
    value: editable ? <InlineField action={patchRental} id={id} field={field} value={value} label={label} {...opts} /> : (opts.display ?? value),
  })
  const depositShown = r.deposit_cents != null && (
    <span className="flex flex-wrap items-center gap-2">
      {t.money(r.deposit_cents)}
      {r.deposit_back_at && <Badge variant="success">{t("rentals.depositBack")}</Badge>}
    </span>
  )
  const properties = (
    <Section id="properties" title={t("rentals.properties")}>
      <DetailList
        items={[
          prop("price", t("rentals.price"), r.price_cents != null ? formatMoney(r.price_cents) : null, { kind: "money", display: r.price_cents != null && t.money(r.price_cents) }),
          prop("unit", t("rentals.unit"), r.unit, { kind: "choice", options: UNITS.map((u) => ({ value: u, label: t.dynamic(`rentals.units.${u}`) })), display: r.unit && t.dynamic(`rentals.units.${r.unit}`) }),
          prop("deposit", t("rentals.deposit"), r.deposit_cents != null ? formatMoney(r.deposit_cents) : null, { kind: "money", display: depositShown }),
          (rates ?? []).length > 0 && prop("rate_id", t("rentals.rate"), r.rate_id, { kind: "choice", options: (rates ?? []).map((x) => ({ value: x.id, label: x.name })), display: r.rental_rates?.name }),
          ...(editable ? customInlineItems(t, defs, r.custom, patchRental, id) : customDetails(t, defs, r.custom)),
          prop("note", t("rentals.note"), r.note || null, { kind: "textarea", display: r.note && <span className="whitespace-pre-line">{r.note}</span> }),
        ]}
      />
    </Section>
  )

  const linked: LinkRow[] = [
    { key: "object", icon: KeyRoundIcon, href: `/rentals/${o.id}`, title: o.name, detail: t("rentals.object") },
    ...(mainId && seesInvoices ? [{ key: "invoices", icon: FileTextIcon, href: `/invoices?contact=${mainId}`, title: t("invoices.nav"), detail: t("rentals.ofMainTenant") }] : []),
    ...(mainId && seesPayments ? [{ key: "payments", icon: CreditCardIcon, href: `/payments?contact=${mainId}`, title: t("payments.nav"), detail: t("rentals.ofMainTenant") }] : []),
    ...(projects ?? []).flatMap((l) => (l.projects ? [{ key: l.projects.id, icon: FolderKanbanIcon, href: `/projects/${l.projects.id}`, title: l.projects.name, detail: t("projects.project") }] : [])),
  ]

  // The one next step: confirm a request, enter notice (long term), take back (short term, running).
  const primary = !editable
    ? undefined
    : r.status === "request"
      ? (
          <SubmitButton form="confirm-rental" size="sm">
            <CheckIcon /> {t("rentals.confirm")}
          </SubmitButton>
        )
      : canNotice
        ? { href: withParams(sp, { edit: "notice", new: undefined, template: undefined }), label: t("rentals.giveNotice"), icon: BanIcon }
        : state === "running" && !long
          ? (
              <SubmitButton form="return-rental" size="sm" data-confirm="rentals.confirmReturn">
                <RotateCcwIcon /> {t("rentals.takeBack")}
              </SubmitButton>
            )
          : undefined
  const newParam = param(sp, "new")
  const editParam = param(sp, "edit")
  const sheetOpen = newParam === "person" || editParam === "term" || editParam === "notice"

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/rentals", label: t("rentals.objects") }, { href: `/rentals/${o.id}`, label: o.name }, { label: wordLabel }]}
        title={`${wordLabel} · ${o.name}`}
        badge={r.deleted_at ? <Badge variant="destructive">{t("rentals.trash")}</Badge> : <StateBadge t={t} r={r} />}
        meta={[peopleLine(people, 3) || null, period(t, r)].filter(Boolean).join(" · ")}
        actions={
          ctx.can("org.files.view") &&
          mainId && (
            <ContractMenu
              label={t("rentals.writeContract")}
              chooseHref={`/files/templates?contact=${mainId}&rental=${id}`}
              items={[...(contracts ?? [])].sort((a, b) => Number(a.org_id === null) - Number(b.org_id === null)).map((c) => ({ href: `${here}?new=contract&template=${c.id}`, label: c.name }))}
            />
          )
        }
        menu={
          editable && (
            <ActionsMenu>
              {r.status === "cancelled" ? (
                <MenuSubmit form="confirm-rental" icon={<CheckIcon />}>
                  {t("rentals.confirmAgain")}
                </MenuSubmit>
              ) : (
                state !== "ended" && (
                  <MenuSubmit form="cancel-rental" icon={<XIcon />} destructive confirm="rentals.confirmCancel">
                    {t("rentals.cancel")}
                  </MenuSubmit>
                )
              )}
              <MenuSeparator />
              <MenuSubmit form="trash-rental" icon={<Trash2Icon />} destructive>
                {t("rentals.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
        primary={primary}
      />
      {editable && (
        <>
          <form id="trash-rental" action={trashRentalAction} hidden>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={`/rentals/${o.id}`} />
          </form>
          <form id="confirm-rental" action={setRentalStatusAction} hidden>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value="confirmed" />
          </form>
          <form id="cancel-rental" action={setRentalStatusAction} hidden>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value="cancelled" />
          </form>
          <form id="return-rental" action={returnAction} hidden>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={here} />
          </form>
        </>
      )}
      <Notice error={!sheetOpen ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      <Stats>
        <Stat label={started ? t("rentals.sinceStat") : t("rentals.startsStat")} value={long ? dayText(berlinDay(r.starts_at)) : timed(r.starts_at)} />
        {deadline ? <Stat label={deadline.label} value={deadline.value} hint={deadline.hint} /> : <Stat label={t("rentals.endsStat")} value={r.ends_at ? timed(r.ends_at) : "–"} />}
        <Stat label={long ? t("rentals.rentStat") : t("rentals.price")} value={r.price_cents != null ? t.money(r.price_cents) : "–"} hint={r.unit ? t.dynamic(`rentals.units.${r.unit}`) : undefined} />
        <Stat label={t("rentals.deposit")} value={r.deposit_cents != null ? t.money(r.deposit_cents) : "–"} hint={r.deposit_back_at ? t("rentals.depositBack") : undefined} />
      </Stats>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-1">{properties}</aside>
        <div className="grid min-w-0 content-start gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Section
            id="terms"
            title={t("rentals.termTitle")}
            description={termText}
            action={
              editable && (
                <Link href={withParams(sp, { edit: "term", new: undefined, template: undefined })} scroll={false} className="text-sm link">
                  {t("rentals.change")}
                </Link>
              )
            }
          >
            <DetailList
              items={[
                { label: t("rentals.starts"), value: timed(r.starts_at) },
                { label: long && r.renew_months && !r.notice_at ? t("rentals.firstTermEnd") : t("rentals.ends"), value: r.ends_at ? timed(r.ends_at) : t("rentals.endsOpen") },
                long && !!r.renew_months && { label: t("rentals.renewLabel"), value: months(r.renew_months) },
                long && r.notice_months != null && { label: t("rentals.notice"), value: months(r.notice_months) },
                !!r.notice_at && { label: t("rentals.noticeAt"), value: t.date(r.notice_at, { dateStyle: "medium" }) },
              ]}
            />
          </Section>

          <Section id="people" title={t("rentals.people")} description={t("rentals.peopleHint")}>
            {people.length ? (
              <ul className="grid divide-y rounded-lg border">
                {people.map((p) => (
                  <li key={p.contact_id} className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm">
                    <Link href={`/contacts/${p.contact_id}`} className="grid min-w-0 flex-1 hover:underline">
                      <span className="truncate font-medium">{p.contacts ? contactName(p.contacts) : "–"}</span>
                      <span className="truncate text-xs text-muted-foreground">{t.dynamic(`rentals.roles.${p.role}`)}</span>
                    </Link>
                    {editable && (
                      <form action={removePersonAction}>
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="contact_id" value={p.contact_id} />
                        <Tooltip>
                          <TooltipTrigger render={<SubmitButton size="icon-sm" variant="ghost" aria-label={t("rentals.removePerson")} data-confirm="rentals.confirmRemovePerson" />}>
                            <XIcon />
                          </TooltipTrigger>
                          <TooltipContent>{t("rentals.removePerson")}</TooltipContent>
                        </Tooltip>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("rentals.nobody")}</p>
            )}
            {editable && <AddLink href={withParams(sp, { new: "person", edit: undefined, template: undefined })}>{t("rentals.addPerson")}</AddLink>}
          </Section>

          {!!handouts?.length && (
            <Section id="keys" title={t("rentals.keys")}>
              <LinkRows
                rows={handouts.map((h) => ({
                  key: h.id,
                  icon: KeyRoundIcon,
                  href: `/rentals/${h.rental_objects?.id}`,
                  title: h.rental_objects?.name ?? "–",
                  detail: `${h.rental_contacts?.[0]?.contacts ? contactName(h.rental_contacts[0].contacts) : "–"} · ${period(t, h)}`,
                  badge: <StateBadge t={t} r={h} />,
                }))}
              />
            </Section>
          )}
        </div>
        <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-2">
          <Section id="linked" title={t("rentals.linked")}>
            <LinkRows rows={linked} />
          </Section>
          <FileList ctx={ctx} entity="rentals" entityId={id} back={here} />
        </aside>
      </div>

      {editable && newParam === "person" && (
        <UrlSheet params={["new"]} title={t("rentals.addPerson")} meta={`${wordLabel} · ${o.name}`} compact>
          <Notice error={param(sp, "error")} />
          <form action={addPersonAction} className="grid gap-4">
            <input type="hidden" name="id" value={id} />
            <ContactPicker name="contact_id" label={t("rentals.person")} />
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t("rentals.role")}</span>
              <Choice name="role" label={t("rentals.role")} required defaultValue={mainId ? "member" : "main"} options={(["main", "member"] as const).map((x) => ({ value: x, label: t(`rentals.roles.${x}`) }))} />
              <p className="text-xs text-muted-foreground">{t("rentals.peopleHint")}</p>
            </div>
            <SaveBar label={t("rentals.addPerson")} always />
          </form>
        </UrlSheet>
      )}

      {editable && editParam === "term" && (
        <UrlSheet params={["edit"]} title={t("rentals.termTitle")} meta={`${wordLabel} · ${o.name}`}>
          <Notice error={param(sp, "error")} />
          <form action={saveTermAction} className="grid gap-4">
            <input type="hidden" name="id" value={id} />
            {long ? (
              <TermFields start={dateValue(r.starts_at)} end={r.ends_at ? dateValue(r.ends_at) : null} renew={r.renew_months} notice={r.notice_months} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid content-start gap-2">
                  <Label htmlFor="e-start">{t("rentals.starts")}</Label>
                  <DateInput id="e-start" name="starts_at" type="datetime-local" required defaultValue={dateValue(r.starts_at)} />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="e-end">{t("rentals.ends")}</Label>
                  <DateInput id="e-end" name="ends_at" type="datetime-local" defaultValue={dateValue(r.ends_at)} />
                </div>
              </div>
            )}
            <SaveBar />
          </form>
        </UrlSheet>
      )}

      {canNotice && editParam === "notice" && (
        <UrlSheet params={["edit"]} title={t("rentals.giveNotice")} meta={`${wordLabel} · ${o.name}`} compact>
          <Notice error={param(sp, "error")} />
          <form action={giveNoticeAction} className="grid gap-4">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm">{t("rentals.noticeHint", { date: dayText(term.kind === "renew" ? term.termEnd : noticeEnd(r, today)) })}</p>
            <div className="grid gap-2">
              <Label htmlFor="g-end">{t("rentals.noticeOtherDate")}</Label>
              <TypedInput kind="date" id="g-end" name="ends_on" />
            </div>
            <SaveBar label={t("rentals.giveNotice")} always confirm="rentals.confirmNotice" />
          </form>
        </UrlSheet>
      )}

      {composer && (
        <UrlSheet params={["new", "template"]} wide title={composer.template.name} description={t("rentals.contractSheetHint")}>
          <Composer
            template={{ id: composer.template.id, name: composer.template.name, title: composer.template.title, body: composer.template.body, letterhead: composer.template.letterhead }}
            fields={readFields(composer.template.fields)}
            seller={composer.head.seller}
            logoUrl={composer.head.logoUrl}
            orgName={composer.head.seller.legal_name ?? ctx.org.name}
            initialContact={null}
            initialFilled={composer.filled}
            canManage={ctx.can("org.files.manage")}
            canPickContact={false}
            fixedContact={composer.contactId}
            rentalId={id}
            doneHref={here}
          />
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false

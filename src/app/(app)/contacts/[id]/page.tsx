import Link from "next/link"
import { notFound } from "next/navigation"
import {
  BriefcaseBusinessIcon,
  CalendarClockIcon,
  CreditCardIcon,
  FileTextIcon,
  GraduationCapIcon,
  IdCardIcon,
  KeyRoundIcon,
  ListChecksIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  ReceiptTextIcon,
  ShoppingBagIcon,
  TicketIcon,
  Trash2Icon,
  WalletIcon,
  ClipboardListIcon,
} from "lucide-react"
import { Choice } from "@/components/choice"
import { customDetails } from "@/components/custom-field-details"
import { customInlineItems } from "@/components/custom-field-inline"
import { InlineField } from "@/components/inline-field"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DetailList } from "@/components/detail-list"
import { FileList } from "@/components/file-list"
import { LinkRows, type LinkRow } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { Page, PageHeader, RecordLayout } from "@/components/page"
import { AddLink, Section } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param } from "@/lib/url"
import { rentalState } from "@/rentals/fields"
import { DocBadge } from "@/app/(app)/invoices/badges"
import { MemberStateBadge, memberState } from "@/app/(app)/members/badges"
import { PayStatusBadge } from "@/app/(app)/payments/badges"
import { OrderBadge } from "@/app/(app)/shop/badges"
import { addNote, deleteNote, linkContactUser, patchContact, restoreContact, saveContactAddress, trashContact, updateContact } from "../actions"
import { ContactForm } from "../contact-form"
import { COUNTRIES, contactName } from "../fields"

type Ctx = Awaited<ReturnType<typeof requirePerm>>
const LIMIT = 10
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const ilikeExact = (v: string) => v.replace(/[%_\\]/g, "\\$&")

// The Person hub: who this is (status, tags, how to reach them), then everything connected to them in the modules
// that are on (membership + open dues, tickets, orders, invoices, payments, courses, rentals, forms, mails, staff),
// files, team access and the activity. Editing the contact's own fields happens in the "Bearbeiten" sheet.
export default async function ContactPage({ params, searchParams }: PageProps<"/contacts/[id]">) {
  const { id } = await params
  const ctx = await requirePerm("crm.view")
  if (!ctx.modules.has("crm") || !/^[0-9a-f-]{36}$/.test(id)) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("crm.manage")
  const on = (module: string, perm: string) => ctx.modules.has(module) && ctx.can(perm)
  const none = Promise.resolve({ data: null })
  const by = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) => q.eq("org_id", ctx.org.id).eq("contact_id", id)
  const now = today()

  const [{ data: c }, { data: notes }, { data: tagRows }, defs, { data: memberships }, { data: openDues }, { data: tickets }, { data: docs }, { data: subs }, { data: changes }, { data: rentals }, { data: shopOrders }, { data: places }, { data: staff }] =
    await Promise.all([
      ctx.supabase.from("contacts").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
      by(ctx.supabase.from("contact_notes").select("id, body, created_at, created_by")).order("created_at", { ascending: false }).limit(200),
      ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id }),
      loadFields(ctx.supabase, ctx.org.id, "contacts"),
      on("members", "members.view")
        ? by(ctx.supabase.from("memberships").select("id, member_no, starts_on, ends_on, paused_from, paused_until, membership_types(name)")).is("deleted_at", null).order("starts_on", { ascending: false }).limit(5)
        : none,
      on("members", "members.view")
        ? ctx.supabase.from("member_dues").select("amount_cents, due_on, membership_id, memberships!inner(contact_id)").eq("org_id", ctx.org.id).eq("status", "open").eq("memberships.contact_id", id).limit(500)
        : none,
      on("tickets", "tickets.view")
        ? by(ctx.supabase.from("tickets").select("id, status, created_at, event_id, order_id, events(title), ticket_types(name)")).order("created_at", { ascending: false }).limit(LIMIT)
        : none,
      on("invoices", "invoices.view")
        ? by(ctx.supabase.from("documents").select("id, kind, status, number, issue_date, due_date, gross_total, currency, created_at")).order("created_at", { ascending: false }).limit(LIMIT)
        : none,
      on("forms", "forms.view")
        ? by(ctx.supabase.from("form_submissions").select("id, status, created_at, form_id, forms(title)")).order("created_at", { ascending: false }).limit(LIMIT)
        : none,
      ctx.supabase.rpc("contact_changes", { p_contact: id }),
      on("rentals", "rentals.view")
        ? by(ctx.supabase.from("rental_contacts").select("role, rentals!inner(id, status, starts_at, ends_at, deleted_at, rental_objects(name))")).is("rentals.deleted_at", null).order("created_at", { ascending: false }).limit(LIMIT)
        : none,
      on("shop", "shop.view")
        ? by(ctx.supabase.from("shop_orders").select("id, number, status, placed_at, pay_orders(amount_total, currency)")).not("placed_at", "is", null).order("placed_at", { ascending: false }).limit(LIMIT)
        : none,
      on("courses", "courses.view")
        ? by(ctx.supabase.from("course_participants").select("id, status, created_at, course_id, courses!inner(title, deleted_at)")).is("courses.deleted_at", null).order("created_at", { ascending: false }).limit(LIMIT)
        : none,
      (on("shifts", "shifts.manage") || on("hr", "hr.view"))
        ? by(ctx.supabase.from("staff").select("id, name, active, role_label, employees(id, job_title, deleted_at)")).limit(3)
        : none,
    ])
  if (!c) notFound()
  const email = c.email ? ilikeExact(c.email) : null
  // Team access: the linked account and (for managers) the team members who could be linked. Payments, mails and
  // guest-list entries don't point at contacts: the contact's email links them (same rule as Zahlungen › ?contact=).
  // Shift team + HR record: by contact, else by the contact's linked account (both are org members' records).
  const byAccount = !staff?.length && c.user_id
  const [{ data: team }, { data: linkedElsewhere }, { data: payments }, { data: mails }, { data: guests }, { data: staffOfUser }, { data: employeeOfUser }] = await Promise.all([
    canManage || c.user_id ? ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id) : Promise.resolve({ data: [] }),
    canManage ? ctx.supabase.from("contacts").select("user_id").eq("org_id", ctx.org.id).not("user_id", "is", null).is("deleted_at", null) : Promise.resolve({ data: [] }),
    on("payments", "payments.view") && email
      ? ctx.supabase.from("pay_orders").select("id, status, source_module, amount_total, currency, created_at").eq("org_id", ctx.org.id).ilike("customer_email", email).order("created_at", { ascending: false }).limit(LIMIT)
      : none,
    on("email", "email.view") && email
      ? ctx.supabase.from("email_history").select("id, subject, kind, source, status, delivery, at").eq("org_id", ctx.org.id).ilike("to_email", email).order("at", { ascending: false }).limit(5)
      : none,
    on("guestlists", "guestlists.view") && email
      ? ctx.supabase.from("guest_entries").select("id, created_at, list_id, guest_lists!inner(name, deleted_at, events(title))").eq("org_id", ctx.org.id).ilike("email", email).is("guest_lists.deleted_at", null).order("created_at", { ascending: false }).limit(LIMIT)
      : none,
    byAccount && on("shifts", "shifts.manage") ? ctx.supabase.from("staff").select("id, name, active, role_label, employees(id, job_title, deleted_at)").eq("org_id", ctx.org.id).eq("user_id", c.user_id!).limit(1) : none,
    c.user_id && on("hr", "hr.view") ? ctx.supabase.from("employees").select("id, job_title, name").eq("org_id", ctx.org.id).eq("user_id", c.user_id).is("deleted_at", null).limit(1) : none,
  ])
  const { data: people } = team?.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", team.map((m) => m.user_id)) : { data: [] }
  const linked = people?.find((p) => p.id === c.user_id)
  const linkable = (people ?? []).filter((p) => !linkedElsewhere?.some((l) => l.user_id === p.id))
  const name = contactName(c)
  const tags = ((tagRows ?? []) as unknown as string[]).sort((a, b) => a.localeCompare(b, t.locale))
  const day = (v: string) => t.date(v, { dateStyle: "medium" })
  const current = memberships?.find((m) => memberState(m, now) !== "ended")
  const owed = (openDues ?? []).reduce((s, d) => s + d.amount_cents, 0)
  const overdue = (openDues ?? []).filter((d) => d.due_on < now)
  const tel = c.phone?.replace(/[^\d+]/g, "")
  const address = [c.street, [c.postal_code, c.city].filter(Boolean).join(" "), c.country && c.country !== "DE" ? new Intl.DisplayNames([t.locale], { type: "region" }).of(c.country) : null].filter(Boolean)
  const canEditMembers = on("members", "members.manage")
  const showAll = (href: string) => (
    <Link href={href} className="text-sm text-[var(--link)] hover:underline">
      {t("common.showAll")}
    </Link>
  )

  const ticketRows: LinkRow[] = [
    ...(tickets ?? []).map((x) => ({
      key: x.id,
      icon: TicketIcon,
      href: on("payments", "payments.view") ? `/payments?edit=${x.order_id}` : `/events/${x.event_id}/tickets`,
      title: x.events?.title ?? "–",
      detail: [x.ticket_types?.name, day(x.created_at)].filter(Boolean).join(" · "),
      badge: <Badge variant={x.status === "valid" || x.status === "used" ? "success" : x.status === "reserved" ? "warning" : "secondary"}>{t.dynamic(`tickets.statuses.${x.status}`)}</Badge>,
    })),
    ...(guests ?? []).map((g) => ({
      key: g.id,
      icon: ListChecksIcon,
      href: `/guestlists/${g.list_id}`,
      title: g.guest_lists.events?.title ?? g.guest_lists.name,
      detail: [t("contacts.hub.guestOn", { list: g.guest_lists.name }), day(g.created_at)].join(" · "),
    })),
  ]
  const staffRow = staff?.[0] ?? staffOfUser?.[0]
  const employee = staffRow?.employees.find((e) => !e.deleted_at) ?? employeeOfUser?.[0]
  const workRows: LinkRow[] = [
    ...(staffRow && on("shifts", "shifts.manage")
      ? [{ key: "staff", icon: CalendarClockIcon, href: `/shifts/team?edit=${staffRow.id}`, title: t("contacts.hub.shiftProfile"), detail: staffRow.role_label ?? staffRow.name, badge: !staffRow.active && <Badge variant="secondary">{t("contacts.hub.inactive")}</Badge> }]
      : []),
    ...(employee && on("hr", "hr.view") ? [{ key: "employee", icon: BriefcaseBusinessIcon, href: `/hr/${employee.id}`, title: t("contacts.hub.employee"), detail: employee.job_title ?? staffRow?.name }] : []),
  ]

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/contacts", label: t("contacts.title") }, { label: name }]}
        title={name}
        badge={
          c.deleted_at ? (
            <Badge variant="destructive">{t("contacts.trash")}</Badge>
          ) : (
            <span className="flex flex-wrap gap-1">
              {current ? (
                <Badge variant="success">{t("contacts.hub.member")}</Badge>
              ) : (
                !!memberships?.length && <Badge variant="secondary">{t("contacts.hub.formerMember")}</Badge>
              )}
              {c.user_id && <Badge variant="info">{t("contacts.team.badge")}</Badge>}
              {c.unsubscribed_at && <Badge variant="warning">{t("contacts.hub.unsubscribed")}</Badge>}
            </span>
          )
        }
        meta={
          (c.company && name !== c.company) || c.tags.length ? (
            <>
              {c.company && name !== c.company && <span>{c.company}</span>}
              {c.tags.map((tg) => (
                <Badge key={tg} variant="outline">
                  {tg}
                </Badge>
              ))}
            </>
          ) : null
        }
        actions={
          !c.deleted_at && (
            <>
              {c.email && (
                <Button render={<a href={`mailto:${c.email}`} />} nativeButton={false} variant="outline" size="sm">
                  <MailIcon /> {t("contacts.email")}
                </Button>
              )}
              {tel && (
                <Button render={<a href={`tel:${tel}`} />} nativeButton={false} variant="outline" size="sm">
                  <PhoneIcon /> {t("contacts.hub.call")}
                </Button>
              )}
            </>
          )
        }
        menu={
          !c.deleted_at &&
          (canManage || ctx.can("org.files.view") || on("invoices", "invoices.manage") || canEditMembers) && (
            <ActionsMenu>
              {canManage && !c.deleted_at && (
                <MenuLink href={`/contacts/${c.id}?edit=details`} icon={<PencilIcon />}>
                  {t("contacts.editAll")}
                </MenuLink>
              )}
              {on("invoices", "invoices.manage") && (
                <MenuLink href={`/invoices/new?contact=${c.id}`} icon={<ReceiptTextIcon />}>
                  {t("contacts.hub.newInvoice")}
                </MenuLink>
              )}
              {canEditMembers && !current && (
                <MenuLink href={`/members/new?contact=${c.id}`} icon={<IdCardIcon />}>
                  {t("membership.makeMember")}
                </MenuLink>
              )}
              {ctx.can("org.files.view") && (
                <MenuLink href={`/files/templates?contact=${c.id}`} icon={<FileTextIcon />}>
                  {t("contacts.writeLetter")}
                </MenuLink>
              )}
              {canManage && (
                <>
                  <MenuSeparator />
                  <MenuSubmit form="trash-contact" icon={<Trash2Icon />} destructive>
                    {t("contacts.toTrash")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
      />
      {canManage && (
        <form id="trash-contact" action={trashContact} hidden>
          <input type="hidden" name="id" value={c.id} />
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {c.deleted_at ? (
        <div className="grid max-w-xl gap-3">
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
            {t("contacts.deletedOn", { date: t.date(c.deleted_at), purge: t.date(new Date(new Date(c.deleted_at).getTime() + 30 * 86_400_000)) })}
          </p>
          {canManage && (
            <form action={restoreContact}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton>{t("contacts.restore")}</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <RecordLayout
          aside={
            <>
              {(linked || canManage) && (
                <Section id="team" title={t("contacts.team.title")} description={t("contacts.team.hint")}>
                  {linked ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-3">
                        <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="grid min-w-0">
                          <span className="truncate font-medium">{linked.full_name || linked.email}</span>
                          <span className="truncate text-xs text-muted-foreground">{t("contacts.team.hasAccess")}</span>
                        </span>
                      </span>
                      {canManage && (
                        <form action={linkContactUser}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="user_id" value="" />
                          <SubmitButton size="sm" variant="ghost" data-confirm="contacts.team.confirmUnlink">
                            {t("contacts.team.unlink")}
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  ) : linkable.length ? (
                    <form action={linkContactUser} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <NativeSelect name="user_id" aria-label={t("contacts.team.pick")} defaultValue="" className="min-w-0 flex-1">
                        <NativeSelectOption value="">{t("contacts.team.pick")}</NativeSelectOption>
                        {linkable.map((p) => (
                          <NativeSelectOption key={p.id} value={p.id}>
                            {p.full_name ? `${p.full_name} · ${p.email}` : p.email}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <SubmitButton size="sm" variant="outline">
                        {t("contacts.team.link")}
                      </SubmitButton>
                    </form>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("contacts.team.none")}</p>
                  )}
                </Section>
              )}
              <Timeline t={t} ctx={ctx} c={c} notes={notes ?? []} changes={changes ?? []} defs={defs} canManage={canManage} />
            </>
          }
        >
          <Section id="details" title={t("contacts.hub.details")}>
            {/* Every value edits in place (Linear style); the address is one small dialog; tags + everything at once
                stay in "Alle Angaben bearbeiten" (⋯). */}
            {canManage && !c.deleted_at ? (
              <DetailList
                items={[
                  { label: t("contacts.firstName"), value: <InlineField action={patchContact} id={c.id} field="first_name" value={c.first_name} label={t("contacts.firstName")} /> },
                  { label: t("contacts.lastName"), value: <InlineField action={patchContact} id={c.id} field="last_name" value={c.last_name} label={t("contacts.lastName")} /> },
                  { label: t("contacts.company"), value: <InlineField action={patchContact} id={c.id} field="company" value={c.company} label={t("contacts.company")} /> },
                  {
                    label: t("contacts.email"),
                    value: <InlineField action={patchContact} id={c.id} field="email" kind="email" value={c.email} label={t("contacts.email")} display={c.email && <a href={`mailto:${c.email}`} className="break-all link">{c.email}</a>} />,
                  },
                  {
                    label: t("contacts.phone"),
                    value: <InlineField action={patchContact} id={c.id} field="phone" kind="phone" value={c.phone} label={t("contacts.phone")} display={c.phone && tel && <a href={`tel:${tel}`} className="link">{c.phone}</a>} />,
                  },
                  {
                    label: t("contacts.address"),
                    value: (
                      <Link href={`/contacts/${c.id}?edit=address`} scroll={false} className="-mx-2 block rounded-md px-2 py-1 hover:bg-muted/60" aria-label={t("common.editField", { field: t("contacts.address") })}>
                        {address.length ? <span className="whitespace-pre-line">{address.join("\n")}</span> : <span className="text-muted-foreground">{t("common.emptyValue")}</span>}
                      </Link>
                    ),
                  },
                  {
                    label: t("contacts.birthday"),
                    value: <InlineField action={patchContact} id={c.id} field="birthday" kind="date" value={c.birthday} label={t("contacts.birthday")} display={c.birthday ? t.date(`${c.birthday}T12:00:00`, { dateStyle: "long" }) : undefined} />,
                  },
                  ...customInlineItems(t, defs, c.custom, patchContact, c.id),
                  c.unsubscribed_at && { label: t("contacts.unsubscribed"), value: day(c.unsubscribed_at) },
                ]}
              />
            ) : (
            <DetailList
              items={[
                {
                  label: t("contacts.email"),
                  value: c.email && (
                    <a href={`mailto:${c.email}`} className="break-all link">
                      {c.email}
                    </a>
                  ),
                },
                {
                  label: t("contacts.phone"),
                  value: c.phone && tel && (
                    <a href={`tel:${tel}`} className="link">
                      {c.phone}
                    </a>
                  ),
                },
                { label: t("contacts.address"), value: address.length ? <span className="whitespace-pre-line">{address.join("\n")}</span> : null },
                c.birthday && { label: t("contacts.birthday"), value: t.date(`${c.birthday}T12:00:00`, { dateStyle: "long" }) },
                ...customDetails(t, defs, c.custom),
                c.unsubscribed_at && { label: t("contacts.unsubscribed"), value: day(c.unsubscribed_at) },
              ]}
            />
            )}
          </Section>

          {on("members", "members.view") && (!!memberships?.length || canEditMembers) && (
            <Section id="membership" title={t("contacts.hub.membership")}>
              {memberships?.length ? (
                <LinkRows
                  rows={[
                    ...(owed
                      ? [
                          {
                            key: "dues",
                            icon: WalletIcon,
                            href: `/members/${(overdue[0] ?? openDues![0]).membership_id}#dues`,
                            title: t("contacts.hub.openDues", { amount: t.money(owed) }),
                            detail: t("contacts.hub.openDuesDetail", { count: openDues!.length }),
                            badge: overdue.length ? <Badge variant="destructive">{t("membership.overdue")}</Badge> : <Badge variant="warning">{t("membership.dueStatus.open")}</Badge>,
                          },
                        ]
                      : []),
                    ...memberships.map((m) => ({
                      key: m.id,
                      icon: IdCardIcon,
                      href: `/members/${m.id}`,
                      title: [m.membership_types?.name ?? "–", m.member_no && t("membership.numberShort", { number: m.member_no })].filter(Boolean).join(" · "),
                      detail: [t("contacts.memberSince", { date: day(m.starts_on) }), m.ends_on && t("membership.state.ending", { date: day(m.ends_on) })].filter(Boolean).join(" · "),
                      badge: <MemberStateBadge t={t} m={m} now={now} />,
                    })),
                  ]}
                />
              ) : null}
              {canEditMembers && !current && <AddLink href={`/members/new?contact=${c.id}`}>{t("membership.makeMember")}</AddLink>}
            </Section>
          )}

          {!!ticketRows.length && (
            <Section id="tickets" title={t("contacts.hub.tickets")}>
              <LinkRows rows={ticketRows} />
            </Section>
          )}

          {!!shopOrders?.length && (
            <Section id="shop" title={t("store.orders")}>
              <LinkRows
                rows={shopOrders.map((o) => ({
                  key: o.id,
                  icon: ShoppingBagIcon,
                  href: `/shop/orders/${o.id}`,
                  title: t("store.orderTitle", { number: String(o.number) }),
                  detail: [o.pay_orders && t.money(o.pay_orders.amount_total, o.pay_orders.currency), o.placed_at && day(o.placed_at)].filter(Boolean).join(" · "),
                  badge: <OrderBadge t={t} status={o.status} />,
                }))}
              />
              {shopOrders.length >= LIMIT && showAll(`/shop/orders?contact=${c.id}&view=all`)}
            </Section>
          )}

          {!!docs?.length && (
            <Section id="invoices" title={t("contacts.invoices")}>
              <LinkRows
                rows={docs.map((d) => ({
                  key: d.id,
                  icon: ReceiptTextIcon,
                  href: `/invoices/${d.id}`,
                  title: `${t.dynamic(`invoices.kinds.${d.kind}`)} ${d.number ?? ""}`.trim(),
                  detail: [t.money(d.gross_total, d.currency), d.issue_date ? day(d.issue_date) : day(d.created_at)].join(" · "),
                  badge: <DocBadge t={t} doc={d} today={now} />,
                }))}
              />
              {docs.length >= LIMIT && showAll(`/invoices?contact=${c.id}`)}
            </Section>
          )}

          {!!payments?.length && (
            <Section id="payments" title={t("payments.title")}>
              <LinkRows
                rows={payments.map((o) => ({
                  key: o.id,
                  icon: CreditCardIcon,
                  href: `/payments?contact=${c.id}&edit=${o.id}`,
                  title: t.dynamic(`payments.sources.${o.source_module}`),
                  detail: [t.money(o.amount_total, o.currency), day(o.created_at)].join(" · "),
                  badge: <PayStatusBadge t={t} status={o.status} />,
                }))}
              />
              {payments.length >= LIMIT && showAll(`/payments?contact=${c.id}`)}
            </Section>
          )}

          {!!places?.length && (
            <Section id="courses" title={t("courses.nav")}>
              <LinkRows
                rows={places.map((p) => ({
                  key: p.id,
                  icon: GraduationCapIcon,
                  href: `/courses/${p.course_id}`,
                  title: p.courses.title,
                  detail: day(p.created_at),
                  badge: <Badge variant={p.status === "enrolled" ? "success" : p.status === "waiting" ? "warning" : "secondary"}>{t.dynamic(`courses.statuses.${p.status}`)}</Badge>,
                }))}
              />
            </Section>
          )}

          {!!rentals?.length && (
            <Section id="rentals" title={t("rentals.title")}>
              <LinkRows
                rows={rentals.map((x) => ({
                  key: x.rentals.id,
                  icon: KeyRoundIcon,
                  href: `/rentals/r/${x.rentals.id}`,
                  title: x.rentals.rental_objects?.name ?? "–",
                  detail: [t.dynamic(`rentals.roles.${x.role}`), day(x.rentals.starts_at), x.rentals.ends_at && `– ${day(x.rentals.ends_at)}`].filter(Boolean).join(" "),
                  badge: <Badge variant="outline">{t.dynamic(`rentals.states.${rentalState(x.rentals)}`)}</Badge>,
                }))}
              />
            </Section>
          )}

          {!!subs?.length && (
            <Section id="forms" title={t("contacts.submissions")}>
              <LinkRows
                rows={subs.map((s) => ({
                  key: s.id,
                  icon: ClipboardListIcon,
                  href: `/forms/${s.form_id}/submissions?edit=${s.id}`,
                  title: s.forms?.title ?? "–",
                  detail: day(s.created_at),
                  badge: <Badge variant={s.status === "accepted" ? "success" : s.status === "new" ? "warning" : "secondary"}>{t.dynamic(`forms.subStatus.${s.status}`)}</Badge>,
                }))}
              />
            </Section>
          )}

          {!!mails?.length && (
            <Section id="emails" title={t("contacts.emails")}>
              <LinkRows
                rows={mails.map((m) => ({
                  key: m.id ?? `${m.at}`,
                  icon: MailIcon,
                  href: `/email/log?contact=${c.id}`,
                  title: m.subject || (m.source ?? "–"),
                  detail: m.at ? t.date(m.at, { dateStyle: "medium", timeStyle: "short" }) : "",
                  badge:
                    m.delivery === "bounced" || m.delivery === "complained" || m.status === "failed" ? (
                      <Badge variant="destructive">{m.delivery ? t.dynamic(`email.delivery.${m.delivery}`) : t.dynamic(`email.sendStatus.${m.status}`)}</Badge>
                    ) : m.status && m.status !== "sent" ? (
                      <Badge variant="warning">{t.dynamic(`email.sendStatus.${m.status}`)}</Badge>
                    ) : undefined,
                }))}
              />
              {showAll(`/email/log?contact=${c.id}`)}
            </Section>
          )}

          {!!workRows.length && (
            <Section id="work" title={t("contacts.hub.work")}>
              <LinkRows rows={workRows} />
            </Section>
          )}

          {ctx.can("org.files.view") && (
            <Section id="files" title={t("files.title")}>
              <FileList ctx={ctx} entity="contacts" entityId={c.id} back={`/contacts/${c.id}`} hideTitle />
            </Section>
          )}
        </RecordLayout>
      )}

      {canManage && !c.deleted_at && param(sp, "edit") === "address" && (
        <UrlSheet params={["edit"]} title={t("contacts.address")} compact>
          <form action={saveContactAddress} className="grid gap-4 px-6 pt-6 sm:grid-cols-2">
            <input type="hidden" name="id" value={c.id} />
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="a-street">{t("contacts.street")}</Label>
              <Input id="a-street" name="street" defaultValue={c.street ?? ""} autoComplete="street-address" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-postal">{t("contacts.postalCode")}</Label>
              <TypedInput kind="postcode" id="a-postal" name="postal_code" defaultValue={c.postal_code ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-city">{t("contacts.city")}</Label>
              <Input id="a-city" name="city" defaultValue={c.city ?? ""} autoComplete="address-level2" />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="a-country">{t("contacts.country")}</Label>
              <Choice id="a-country" name="country" label={t("contacts.country")} defaultValue={c.country} options={COUNTRIES.map((code) => ({ value: code, label: new Intl.DisplayNames([t.locale], { type: "region" }).of(code) ?? code }))} />
            </div>
            <div className="sm:col-span-2">
              <SaveBar />
            </div>
          </form>
        </UrlSheet>
      )}
      {canManage && !c.deleted_at && param(sp, "edit") === "details" && (
        <UrlSheet params={["edit"]} title={name}>
          <ContactForm t={t} action={updateContact} c={c} defs={defs} tags={tags} />
        </UrlSheet>
      )}
    </Page>
  )
}

// Contact fields shown in the timeline's change entries (others, like technical columns, are left out).
const FIELD_LABELS: Record<string, string> = {
  first_name: "contacts.firstName",
  last_name: "contacts.lastName",
  company: "contacts.company",
  email: "contacts.email",
  phone: "contacts.phone",
  street: "contacts.street",
  postal_code: "contacts.postalCode",
  city: "contacts.city",
  country: "contacts.country",
  birthday: "contacts.birthday",
  tags: "contacts.tags",
  unsubscribed_at: "contacts.unsubscribed",
}

/** One change-log entry → [{ label, from, to }] for the fields people know (custom fields by their label). */
function fieldChanges(oldRow: unknown, newRow: unknown, defs: { key: string; label: string; type: string }[], t: T) {
  const o = (oldRow ?? {}) as Record<string, unknown>
  const n = (newRow ?? {}) as Record<string, unknown>
  const show = (v: unknown, key?: string): string => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "–"
    if (Array.isArray(v)) return v.join(", ")
    if (typeof v === "boolean") return v ? "✓" : "✗"
    const s = String(v)
    if (key === "unsubscribed_at" || /^\d{4}-\d{2}-\d{2}T/.test(s)) return t.date(s, { dateStyle: "medium" })
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return t.date(`${s}T12:00:00`, { dateStyle: "medium" })
    return s.length > 80 ? `${s.slice(0, 80)}…` : s
  }
  const out: { label: string; from: string; to: string }[] = []
  for (const [key, label] of Object.entries(FIELD_LABELS))
    if (key in n || key in o) {
      const from = show(o[key], key)
      const to = show(n[key], key)
      if (from !== to) out.push({ label: t.dynamic(label), from, to })
    }
  if ("custom" in n || "custom" in o) {
    const oc = (o.custom ?? {}) as Record<string, unknown>
    const nc = (n.custom ?? {}) as Record<string, unknown>
    for (const key of new Set([...Object.keys(oc), ...Object.keys(nc)])) {
      const from = show(oc[key])
      const to = show(nc[key])
      if (from !== to) out.push({ label: defs.find((d) => d.key === key)?.label ?? key, from, to })
    }
  }
  return out
}

// Notes, field changes (from the change log) and creation, newest first.
async function Timeline({
  t,
  ctx,
  c,
  notes,
  changes,
  defs,
  canManage,
}: {
  t: T
  ctx: Ctx
  c: { id: string; created_at: string; updated_at: string; created_by: string | null }
  notes: { id: string; body: string; created_at: string; created_by: string | null }[]
  changes: { at: string; actor_id: string | null; old: unknown; new: unknown; via: string | null }[]
  defs: { key: string; label: string; type: string }[]
  canManage: boolean
}) {
  const authorIds = [...new Set([c.created_by, ...notes.map((n) => n.created_by), ...changes.map((x) => x.actor_id)].filter((v): v is string => !!v))]
  const { data: people } = authorIds.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", authorIds) : { data: [] }
  const who = (id: string | null) => {
    const p = people?.find((x) => x.id === id)
    return p?.full_name || p?.email || t("contacts.someone")
  }
  const dt = (v: string) => t.date(v, { dateStyle: "medium", timeStyle: "short" })
  const timeline = [
    ...notes.map((n) => ({ key: n.id, at: n.created_at, note: n })),
    ...changes.flatMap((x, i) => {
      const diff = fieldChanges(x.old, x.new, defs, t)
      return diff.length ? [{ key: `change-${i}`, at: x.at, note: null, diff, actor: x.actor_id, via: x.via }] : []
    }),
    { key: "created", at: c.created_at, note: null },
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <Section id="activity" title={t("contacts.timeline")}>
      {canManage && (
        <form action={addNote} className="grid gap-2">
          <input type="hidden" name="id" value={c.id} />
          <Textarea name="body" required maxLength={10000} rows={3} placeholder={t("contacts.notePlaceholder")} aria-label={t("contacts.notePlaceholder")} />
          <SubmitButton size="sm" variant="outline" className="justify-self-start">
            {t("contacts.addNote")}
          </SubmitButton>
        </form>
      )}
      <ol className="grid gap-3 border-l pl-4">
        {timeline.map((e) => (
          <li key={e.key} className="relative grid gap-1 text-sm">
            <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border" aria-hidden />
            <span className="text-xs text-muted-foreground">
              {dt(e.at)}
              {e.note && ` · ${who(e.note.created_by)}`}
              {"actor" in e && e.actor && ` · ${who(e.actor)}`}
              {"via" in e && e.via && ` · ${e.via.startsWith("oauth:") ? t("contacts.viaAi") : t("contacts.viaApi")}`}
            </span>
            {e.note ? (
              <div className="flex items-start gap-2">
                <p className="flex-1 break-words whitespace-pre-wrap">{e.note.body}</p>
                {canManage && (
                  <form action={deleteNote}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="note" value={e.note.id} />
                    <Tooltip>
                      <TooltipTrigger render={<SubmitButton variant="ghost" size="icon-sm" aria-label={t("contacts.deleteNote")} data-confirm="contacts.confirmDeleteNote" />}>
                        <Trash2Icon />
                      </TooltipTrigger>
                      <TooltipContent>{t("contacts.deleteNote")}</TooltipContent>
                    </Tooltip>
                  </form>
                )}
              </div>
            ) : e.key === "created" ? (
              <p>
                {t("contacts.createdEntry")} · <span className="text-muted-foreground">{t("contacts.createdBy", { who: who(c.created_by) })}</span>
              </p>
            ) : "diff" in e && e.diff ? (
              <ul className="grid gap-0.5">
                {e.diff.map((d) => (
                  <li key={d.label} className="break-words">
                    <span className="text-muted-foreground">{d.label}:</span> <span className="text-muted-foreground line-through">{d.from}</span> → {d.to}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  )
}

export const instant = false

import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarClockIcon, CheckCircle2Icon, CircleIcon, ExternalLinkIcon, FolderKanbanIcon, ListChecksIcon, MailIcon, PlusIcon, ReceiptIcon, ScanLineIcon, WalletIcon, type LucideIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DetailList } from "@/components/detail-list"
import { FileList } from "@/components/file-list"
import { ImageForm } from "@/components/image-form"
import { Notice } from "@/components/notice"
import { RecordLayout } from "@/components/page"
import { AreaIcon } from "@/components/area-icon"
import { AddLink, Section } from "@/components/section"
import { Picture } from "@/components/picture"
import { Stat, Stats } from "@/components/stats"
import { UrlSheet } from "@/components/url-sheet"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, siteUrl, type SearchParams } from "@/lib/url"
import { InlineField } from "@/components/inline-field"
import { customInlineItems } from "@/components/custom-field-inline"
import { customDetails } from "@/components/custom-field-details"
import { toLocalInput } from "@/lib/time"
import { patchEvent, updateEvent, updateEventImage } from "../actions"
import { EventForm } from "../event-form"

// Event overview: what's the state (tickets, money, check-ins, waiting list), what's still missing before it goes
// live, the description and the next slots of the programme; the right rail holds the properties (edited in place),
// the connections, the picture and files. The whole form stays reachable from ⋯ "Alle Angaben bearbeiten" (?edit=<id>).
export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<SearchParams> }) {
  const { eventId } = await params
  const ctx = await requirePerm("events.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("events.manage")
  const tickets = ctx.modules.has("tickets") && ctx.can("tickets.view")
  const none = Promise.resolve({ data: null, count: null })
  const on = (m: string, p: string) => ctx.modules.has(m) && ctx.can(p)
  const mails = on("email", "email.view")
  const [{ data: ev }, { data: sold }, { data: types }, { count: waiting }, { data: slots }, defs, { count: orders }, { count: shifts }, { count: lists }, { data: projects }, { count: campaigns }, { data: locations }, { data: templates }] = await Promise.all([
    ctx.supabase.from("events").select("*, locations(name, address), email_templates(name)").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle(),
    tickets ? ctx.supabase.from("tickets").select("type_id, status, price").eq("event_id", eventId).in("status", ["valid", "used"]) : none,
    tickets ? ctx.supabase.from("ticket_types").select("id, guest_list_id, for_members").eq("event_id", eventId) : none,
    tickets
      ? ctx.supabase.from("event_waitlist").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("org_id", ctx.org.id).in("status", ["waiting", "offered"])
      : none,
    ctx.supabase.from("event_slots").select("id, title, stage, starts_at, artists(name)").eq("event_id", eventId).order("starts_at").limit(5),
    loadFields(ctx.supabase, ctx.org.id, "events"),
    // The event hub's connections to other modules (only those that are on and permitted).
    on("payments", "payments.view")
      ? ctx.supabase.from("pay_orders").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("source_module", "tickets").eq("source_id", eventId).neq("status", "open")
      : none,
    on("shifts", "shifts.view") ? ctx.supabase.from("shifts").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("event_id", eventId) : none,
    on("guestlists", "guestlists.view")
      ? ctx.supabase.from("guest_lists").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("event_id", eventId).is("deleted_at", null)
      : none,
    on("projects", "projects.view")
      ? ctx.supabase.from("project_links").select("projects(id, name)").eq("org_id", ctx.org.id).eq("entity", "events").eq("entity_id", eventId)
      : none,
    // Campaigns to this event's buyers (audience.event).
    tickets && on("email", "email.view")
      ? ctx.supabase.from("email_campaigns").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null).eq("audience->>event", eventId)
      : none,
    // Choices for the inline properties (saved place, mail template).
    canManage ? ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name") : none,
    canManage && mails ? ctx.supabase.from("email_templates").select("id, name").eq("org_id", ctx.org.id).order("name") : none,
  ])
  if (!ev) notFound()

  if (ev.deleted_at)
    return (
      <>
        <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t("eventsPage.deletedOn", { date: t.date(ev.deleted_at), purge: t.date(new Date(new Date(ev.deleted_at).getTime() + 30 * 86_400_000)) })}
        </p>
      </>
    )

  const base = `/events/${ev.id}`
  const shop = new Set((types ?? []).filter((ty) => !ty.guest_list_id && !ty.for_members).map((ty) => ty.id))
  const shopSold = (sold ?? []).filter((k) => shop.has(k.type_id))
  const revenue = shopSold.reduce((n, k) => n + (k.price ?? 0), 0)
  const checkedIn = (sold ?? []).filter((k) => k.status === "used").length
  const publicUrl = siteUrl(ctx.org.slug, `/e/${ev.slug}`, ctx.org.site_domain)
  const links = (ev.links as { label: string; url: string }[] | null) ?? []
  const editing = canManage && param(sp, "edit") === ev.id
  const door = ev.door as { cash_account_id?: string | null } | null
  const linkedProjects = (projects ?? []).flatMap((l) => (l.projects ? [l.projects] : []))
  const connections: { area: string; icon: LucideIcon; label: string; detail?: string | number; href: string; add?: { href: string; label: string } }[] = [
    ...(on("tickets", "tickets.scan") || on("guestlists", "guestlists.checkin") ? [{ area: "events", icon: ScanLineIcon, label: t("tickets.scanNav"), href: `/scan?event=${ev.id}` }] : []),
    ...(on("payments", "payments.view") ? [{ area: "finance", icon: ReceiptIcon, label: t("eventsPage.linked.orders"), detail: orders ?? 0, href: `/payments?event=${ev.id}` }] : []),
    ...(on("guestlists", "guestlists.view")
      ? [{ area: "events", icon: ListChecksIcon, label: t("guestlists.title"), detail: lists ?? 0, href: `${base}/guestlists`, add: ctx.can("guestlists.manage") ? { href: `/guestlists/new?event=${ev.id}`, label: t("guestlists.new") } : undefined }]
      : []),
    ...(tickets && on("email", "email.view")
      ? [
          {
            area: "communication",
            icon: MailIcon,
            label: t("eventsPage.linked.campaigns"),
            detail: campaigns ?? 0,
            href: `/email?event=${ev.id}`,
            add: ctx.can("email.manage") ? { href: `/email/new?event=${ev.id}`, label: t("eventsPage.linked.campaignToBuyers") } : undefined,
          },
        ]
      : []),
    ...(on("shifts", "shifts.view")
      ? [
          {
            area: "shifts",
            icon: CalendarClockIcon,
            label: t("shifts.title"),
            detail: shifts ?? 0,
            href: `/shifts?event=${ev.id}`,
            add: ctx.can("shifts.manage") ? { href: `/shifts?event=${ev.id}&new=shift&start=${encodeURIComponent(ev.starts_at)}`, label: t("eventsPage.linked.planShifts") } : undefined,
          },
        ]
      : []),
    ...(on("cashbook", "cashbook.view") && door?.cash_account_id
      ? [{ area: "finance", icon: WalletIcon, label: t("eventsPage.linked.cashbook"), href: `/cashbook?account=${door.cash_account_id}&month=${ev.starts_at.slice(0, 7)}` }]
      : []),
    ...linkedProjects.map((p) => ({ area: "projects", icon: FolderKanbanIcon, label: p.name, href: `/projects/${p.id}` })),
  ]

  // Before going live: what a good event page has (Luma/Eventbrite-style checklist), each step one click away.
  const steps =
    ev.status === "draft"
      ? [
          { done: !!(ev.venue_name || ev.location_id), label: t("eventsPage.steps.place"), href: `${base}#details` },
          { done: !!ev.description, label: t("eventsPage.steps.description"), href: `${base}#about` },
          { done: !!ev.image_path, label: t("eventsPage.steps.image"), href: `${base}#image` },
          ...(tickets ? [{ done: shop.size > 0, label: t("eventsPage.steps.tickets"), href: `${base}/tickets?new=type` }] : []),
        ]
      : []

  // Eigenschaften: each value edited where it is shown (patchEvent checks it like the form); links + address stay in "Alle Angaben".
  const prop = (field: string, label: string, value: string | null, opts: Omit<React.ComponentProps<typeof InlineField>, "action" | "id" | "field" | "value" | "label"> = {}) => ({
    label,
    value: <InlineField action={patchEvent} id={ev.id} field={field} value={value} label={label} disabled={!canManage} {...opts} />,
  })
  const at = (iso: string) => t.date(iso, { dateStyle: "medium", timeStyle: "short" })
  const properties = [
    prop("starts_at", t("eventsPage.startsAtShort"), toLocalInput(ev.starts_at), { kind: "datetime", display: at(ev.starts_at) }),
    prop("ends_at", t("eventsPage.endsAtShort"), ev.ends_at ? toLocalInput(ev.ends_at) : null, { kind: "datetime", display: ev.ends_at ? at(ev.ends_at) : undefined }),
    ...((locations?.length ?? 0) > 0 || ev.locations
      ? [prop("location_id", t("eventsPage.savedPlace"), ev.location_id, { kind: "choice", options: (locations ?? []).map((l) => ({ value: l.id, label: l.name })), display: ev.locations?.name })]
      : []),
    prop("venue_name", t("eventsPage.venueNameShort"), ev.venue_name),
    prop("venue_address", t("eventsPage.venueAddressShort"), ev.venue_address),
    prop("capacity", t("eventsPage.capacityShort"), ev.capacity == null ? null : String(ev.capacity), { kind: "number", display: ev.capacity == null ? undefined : String(ev.capacity) }),
    ...(mails && (canManage || ev.email_templates)
      ? [prop("email_template_id", t("eventsPage.emailTemplate"), ev.email_template_id, { kind: "choice", options: (templates ?? []).map((x) => ({ value: x.id, label: x.name })), display: ev.email_templates?.name })]
      : []),
    {
      label: t("eventsPage.publicPage"),
      value:
        ev.status === "draft" ? (
          <span className="text-muted-foreground">{t("eventsPage.notLiveYet", { path: `/e/${ev.slug}` })}</span>
        ) : (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 break-all">
            /e/{ev.slug} <ExternalLinkIcon className="size-3.5" />
          </a>
        ),
    },
    links.length > 0 && {
      label: t("eventsPage.links"),
      value: (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="link">
              {l.label}
            </a>
          ))}
        </span>
      ),
    },
    ...(canManage ? customInlineItems(t, defs, ev.custom, patchEvent, ev.id) : customDetails(t, defs, ev.custom)),
  ]

  return (
    <>
      <Notice error={editing ? undefined : param(sp, "error")} ok={param(sp, "ok")} />
      {tickets && (
        <Stats>
          <Stat
            label={t("eventsPage.stats.sold")}
            value={ev.capacity ? `${shopSold.length} / ${ev.capacity}` : shopSold.length}
            hint={ev.capacity ? t("eventsPage.stats.left", { count: Math.max(0, ev.capacity - (sold?.length ?? 0)) }) : undefined}
            href={`${base}/tickets`}
          />
          <Stat label={t("eventsPage.stats.revenue")} value={t.money(revenue)} hint={t("eventsPage.stats.revenueHint")} href={`${base}/tickets#sold`} />
          <Stat label={t("eventsPage.stats.checkedIn")} value={`${checkedIn} / ${sold?.length ?? 0}`} hint={t("eventsPage.stats.checkedInHint")} />
          <Stat label={t("eventsPage.stats.waitlist")} value={waiting ?? 0} href={waiting ? `${base}/tickets#waitlist` : undefined} />
        </Stats>
      )}
      <RecordLayout
        top={
          <Section id="details" title={t("common.properties")}>
            <DetailList items={properties} />
          </Section>
        }
        aside={
          <>
            {connections.length > 0 && (
              <Section id="linked" title={t("eventsPage.linked.title")}>
                <ul className="-mx-2 grid gap-0.5">
                  {connections.map((c) => (
                    <li key={c.href} className="flex items-center gap-1">
                      <Link href={c.href} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted">
                        <AreaIcon area={c.area} icon={c.icon} />
                        <span className="min-w-0 flex-1 truncate">{c.label}</span>
                        {c.detail != null && <span className="text-muted-foreground tabular-nums">{c.detail}</span>}
                      </Link>
                      {c.add && (
                        <Tooltip>
                          <TooltipTrigger render={<Button render={<Link href={c.add.href} />} nativeButton={false} size="icon-sm" variant="ghost" aria-label={c.add.label} />}>
                            <PlusIcon />
                          </TooltipTrigger>
                          <TooltipContent>{c.add.label}</TooltipContent>
                        </Tooltip>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section id="image" title={t("eventsPage.image")}>
              {canManage ? (
                <ImageForm labelHidden action={updateEventImage} id="ev-image" label={t("eventsPage.image")} hint={t("eventsPage.imageHint")} name={ev.title} path={ev.image_path} square hidden={{ id: ev.id }} />
              ) : (
                <Picture path={ev.image_path} name={ev.title} size="lg" square />
              )}
            </Section>
            {ctx.can("org.files.view") && (
              <Section id="files" title={t("files.title")}>
                <FileList ctx={ctx} entity="events" entityId={ev.id} back={base} hideTitle />
              </Section>
            )}
          </>
        }
      >
        {steps.length > 0 && (
          <Section id="steps" title={t("eventsPage.steps.title")} description={t("eventsPage.steps.text")}>
            <ul className="grid gap-1">
              {steps.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} scroll={false} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted">
                    {s.done ? <CheckCircle2Icon className="size-4 text-primary" /> : <CircleIcon className="size-4 text-muted-foreground" />}
                    <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {(ev.description || canManage) && (
          <Section id="about" title={t("eventsPage.description")}>
            {canManage ? (
              <InlineField action={patchEvent} id={ev.id} field="description" value={ev.description} label={t("eventsPage.description")} kind="textarea" />
            ) : (
              <p className="text-sm whitespace-pre-line">{ev.description}</p>
            )}
          </Section>
        )}
        <Section
          id="programme"
          title={t("eventsPage.programme")}
          action={
            slots?.length ? (
              <Button render={<Link href={`${base}/lineup`} />} nativeButton={false} size="sm" variant="ghost">
                {t("common.showAll")}
              </Button>
            ) : undefined
          }
        >
          {slots?.length ? (
            <ul className="grid gap-2 text-sm">
              {slots.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className="w-24 shrink-0 text-muted-foreground tabular-nums">{t.date(s.starts_at, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="min-w-0 truncate font-medium">
                    {s.artists?.name ?? s.title}
                    {s.stage && <span className="font-normal text-muted-foreground"> · {s.stage}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : canManage ? (
            <AddLink href={`${base}/lineup?new=slot`}>{t("lineup.newSlot")}</AddLink>
          ) : (
            <p className="text-sm text-muted-foreground">{t("lineup.empty")}</p>
          )}
        </Section>
      </RecordLayout>
      {editing && (
        <UrlSheet params={["edit"]} title={t("eventsPage.editTitle")}>
          <Notice error={param(sp, "error")} />
          <EventForm t={t} action={updateEvent} ev={ev} />
        </UrlSheet>
      )}
    </>
  )
}

export const instant = false

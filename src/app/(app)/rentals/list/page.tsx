import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeftIcon, DownloadIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { Button } from "@/components/ui/button"
import { BulkBar } from "@/components/bulk-bar"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { FAMILIES, notOver } from "@/rentals/fields"
import { contactName } from "../../contacts/fields"
import { bulkTrashRentals, restoreRentalAction } from "../actions"
import { StateBadge } from "../badges"
import { kindLabel, peopleLine, period } from "../parts"
import { RentalViews } from "../views"

const VIEWS = ["current", "upcoming", "requests", "ended", "all"] as const
const UUID = /^[0-9a-f-]{36}$/

// All rentals (contracts, bookings, loans, handouts) across objects: what runs now, what's planned, open requests.
// Search = object name; ?contact= / ?object= (from the contact or object page) narrow it to one person / object; Kalender = the Belegung view.
export default async function RentalListPage({ searchParams }: PageProps<"/rentals/list">) {
  const ctx = await requirePerm("rentals.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("rentals.manage")
  if (param(sp, "view") === "trash") redirect("/rentals/list?trash=1") // old trash link
  const trash = canManage && param(sp, "trash") === "1"
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "current"
  const family = FAMILIES.find((f) => f === param(sp, "family"))
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const contactId = UUID.test(param(sp, "contact") ?? "") ? param(sp, "contact")! : null
  const objectId = UUID.test(param(sp, "object") ?? "") ? param(sp, "object")! : null
  const page = pageParam(sp)
  const now = new Date().toISOString()
  const [{ data: person }, { data: theirs }, { data: object }, { count: total }] = await Promise.all([
    contactId ? ctx.supabase.from("contacts").select("first_name, last_name, company, email").eq("id", contactId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    contactId ? ctx.supabase.from("rental_contacts").select("rental_id").eq("contact_id", contactId).eq("org_id", ctx.org.id).limit(1000) : Promise.resolve({ data: null }),
    objectId ? ctx.supabase.from("rental_objects").select("name").eq("id", objectId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    // Has this org ever had a rental? (the empty state with the action vs. "nothing in this view")
    ctx.supabase.from("rentals").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id),
  ])
  let query = ctx.supabase
    .from("rentals")
    .select("id, status, starts_at, ends_at, price_cents, unit, renew_months, notice_at, deleted_at, rental_objects!inner(id, name, kind, family), rental_contacts(role, contacts(first_name, last_name, company, email))")
    .eq("org_id", ctx.org.id)
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false }) : query.is("deleted_at", null)
  if (family) query = query.eq("rental_objects.family", family)
  if (q) query = query.ilike("rental_objects.name", `%${q}%`)
  if (objectId) query = query.eq("object_id", objectId)
  if (theirs) query = query.in("id", theirs.map((x) => x.rental_id))
  if (trash) {
    // trash: no time filter
  } else if (view === "current") query = query.eq("status", "confirmed").lte("starts_at", now).or(notOver(now)).order("starts_at", { ascending: false })
  else if (view === "upcoming") query = query.eq("status", "confirmed").gt("starts_at", now).order("starts_at")
  else if (view === "requests") query = query.eq("status", "request").order("starts_at")
  else if (view === "ended") query = query.lte("ends_at", now).order("ends_at", { ascending: false })
  else if (view === "all") query = query.order("starts_at", { ascending: false })
  const { data } = await query
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const chip = (label: string, drop: string) => (
    <Button render={<Link href={`/rentals/list${withParams(sp, { [drop]: undefined, page: undefined })}`} aria-label={`${label} – ${t("common.clear")}`} />} nativeButton={false} size="sm" variant="secondary">
      {label} <XIcon />
    </Button>
  )

  return (
    <Page>
      <PageHeader
        area="rentals"
        title={trash ? `${t("rentals.tabs.rentals")} · ${t("rentals.trash")}` : t("rentals.tabs.rentals")}
        primary={canManage && !trash ? { href: "/rentals/r/new", label: t("rentals.newRentalAny") } : undefined}
        menu={
          <ActionsMenu>
            <MenuExport entity="rentals" query={{ view, family }} />
            {canManage && (
              <>
                <MenuSeparator />
                <MenuLink href={trash ? "/rentals/list" : "/rentals/list?trash=1"} icon={trash ? <ArrowLeftIcon /> : <Trash2Icon />}>
                  {trash ? t("rentals.backToRentals") : t("rentals.trash")}
                </MenuLink>
              </>
            )}
          </ActionsMenu>
        }
      />
      {trash && <p className="text-sm text-muted-foreground">{t("rentals.trashHint", { days: 30 })}</p>}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {!trash && (
        <ListToolbar search={<SearchBox q={q} label={t("rentals.searchRentals")} />}>
          <Segments label={t("rentals.stateCol")} items={VIEWS.map((v) => ({ href: withParams(sp, { view: v === "current" ? undefined : v, page: undefined }), current: v === view, label: t.dynamic(`rentals.views.${v}`) }))} />
          <FilterMenu param="family" label={t("rentals.filterFamily")} options={FAMILIES.map((f) => ({ value: f, label: t.dynamic(`rentals.families.${f}`) }))} />
          {person && chip(contactName(person), "contact")}
          {object && chip(object.name, "object")}
          <RentalViews t={t} current="list" />
        </ListToolbar>
      )}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={trash ? undefined : (r) => `/rentals/r/${r.id}`}
        select={canManage && !trash ? { form: "bulk-rentals", label: t("common.select") } : undefined}
        empty={
          trash ? (
            t("rentals.emptyTrash")
          ) : total ? (
            t("rentals.noRentalsHere")
          ) : (
            <EmptyState
              area="rentals"
              title={t("rentals.listEmpty")}
              text={t("rentals.listEmptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/rentals/r/new" />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("rentals.newRentalAny")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("rentals.object"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{r.rental_objects.name}</span>
                <span className="text-xs text-muted-foreground">{kindLabel(t, r.rental_objects.kind)}</span>
              </span>
            ),
          },
          { header: t("rentals.whoCol"), cell: (r) => peopleLine(r.rental_contacts) || "–", phone: false },
          // Phones: the state first, then the main tenant (the rest is on the rental).
          { header: t("rentals.stateCol"), table: false, phone: trash ? false : undefined, cell: (r) => <StateBadge t={t} r={r} /> },
          { header: t("rentals.whoCol"), table: false, cell: (r) => peopleLine(r.rental_contacts, 1) || null },
          { header: t("rentals.whenCol"), cell: (r) => period(t, r), phone: false },
          // Phones: a short start for what is still to come (the full period is on the rental).
          { header: t("rentals.whenCol"), table: false, cell: (r) => (Date.parse(r.starts_at) > Date.now() ? t.date(r.starts_at, r.unit === "hour" || r.unit === "day" ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }) : null) },
          { header: t("rentals.priceCol"), cell: (r) => (r.price_cents != null && r.unit ? `${t.money(r.price_cents)} ${t.dynamic(`rentals.units.${r.unit}`)}` : ""), className: "whitespace-nowrap text-right tabular-nums" },
          {
            header: t("rentals.stateCol"),
            phone: trash ? undefined : false,
            cell: (r) =>
              r.deleted_at ? (
                <form action={restoreRentalAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="sm" variant="outline">
                    {t("rentals.restore")}
                  </SubmitButton>
                </form>
              ) : (
                <StateBadge t={t} r={r} />
              ),
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
      {canManage && !trash && (
        <BulkBar form="bulk-rentals">
          <input type="hidden" name="back" value={`/rentals/list${withParams(sp, {})}`} />
          <Button type="submit" size="sm" variant="outline" formAction="/export/rentals" formMethod="get" name="format" value="xlsx">
            <DownloadIcon /> {t("common.exportSelected")}
          </Button>
          <SubmitButton size="sm" variant="ghost" formAction={bulkTrashRentals} data-confirm="common.confirmTrashMany" className="text-destructive hover:text-destructive">
            <Trash2Icon /> {t("common.toTrash")}
          </SubmitButton>
        </BulkBar>
      )}
    </Page>
  )
}

export const instant = false

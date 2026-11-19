import { paidUntil, type Interval } from "@/members/dues"
import { redirect } from "next/navigation"
import Link from "next/link"
import { MemberImportBody } from "./import/body"
import { UrlSheet } from "@/components/url-sheet"
import { DownloadIcon, IdCardIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { BulkBar } from "@/components/bulk-bar"
import { Button } from "@/components/ui/button"
import { ActionsMenu, MenuExport, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { FilterMenu } from "@/components/filter-menu"
import { EmptyState, PageHeader } from "@/components/page"
import { contactName } from "@/app/(app)/contacts/fields"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Segments } from "@/components/segments"
import { Notice } from "@/components/notice"
import { Badge } from "@/components/ui/badge"
import { MemberStateBadge } from "./badges"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { TYPE_COLS } from "./membership-parts"
import { matchWords } from "@/lib/search-words"

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const ctx = await requirePerm("members.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("members.manage")
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  // Old trash links (?status=trash) → ?trash=1.
  if (param(sp, "status") === "trash") redirect(`/members?trash=1`)
  const trash = canManage && param(sp, "trash") === "1"
  const status = trash ? "trash" : ((["active", "ended", "all"] as const).find((s) => s === param(sp, "status")) ?? "active")
  const typeFilter = param(sp, "type")
  const page = pageParam(sp)
  // Old drawer links (?edit=<id>) → the membership's page.
  const editId = param(sp, "edit")
  if (editId && /^[0-9a-f-]{36}$/.test(editId)) redirect(`/members/${editId}`)
  if (param(sp, "new")) redirect(`/members/new${param(sp, "contact") ? `?contact=${param(sp, "contact")}` : ""}`) // old drawer link
  const now = today()

  let query = ctx.supabase
    .from("memberships")
    .select("id, number, member_no, starts_on, ends_on, paused_from, paused_until, type_id, fee_interval, contact_id, contacts!inner(first_name, last_name, company, email, user_id)")
    .eq("org_id", ctx.org.id)
    .order("number")
    .range(...pageRange(page))
  query = status === "trash" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (status === "active") query = query.or(`ends_on.is.null,ends_on.gte.${now}`)
  if (status === "ended") query = query.lt("ends_on", now)
  if (typeFilter) query = query.eq("type_id", typeFilter)
  if (q) query = matchWords(query, q, ["first_name", "last_name", "company", "email"], { referencedTable: "contacts" })
  const [{ data }, { data: types }, { count: activeCount }, { count: anyCount }] = await Promise.all([
    query,
    ctx.supabase.from("membership_types").select(TYPE_COLS).eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null).lte("starts_on", now).or(`ends_on.is.null,ends_on.gte.${now}`),
    ctx.supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null),
  ])
  // One row per person: the newest membership of each contact on this page; their other periods fold out under the name.
  // ponytail: grouping per page, a person whose periods straddle a page break shows on both pages.
  const rows = [...new Map((data?.slice(0, PAGE_SIZE) ?? []).sort((a, b) => b.starts_on.localeCompare(a.starts_on)).reverse().map((m) => [m.contact_id, m])).values()].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const [{ data: others }, { data: fees }] =
    rows.length && status !== "trash"
      ? await Promise.all([
          ctx.supabase.from("memberships").select("id, contact_id, starts_on, ends_on, type_id").eq("org_id", ctx.org.id).is("deleted_at", null).in("contact_id", rows.map((r) => r.contact_id)).order("starts_on", { ascending: false }),
          // Period fees of the shown memberships, for "Bezahlt bis".
          ctx.supabase.from("member_dues").select("membership_id, kind, period_start, status").eq("org_id", ctx.org.id).eq("kind", "fee").in("membership_id", rows.map((r) => r.id)).limit(5000),
        ])
      : [{ data: [] }, { data: [] }]
  const until = (r: (typeof rows)[number]) =>
    paidUntil((fees ?? []).filter((f) => f.membership_id === r.id), (r.fee_interval ?? types?.find((x) => x.id === r.type_id)?.interval ?? "none") as Interval)
  // Red when fees exist and the paid time is over (or nothing paid yet) on a running membership; without fees "–".
  const behind = (r: (typeof rows)[number]) => {
    const u = until(r)
    return (fees ?? []).some((f) => f.membership_id === r.id) && (!u || u < now) && (!r.ends_on || r.ends_on >= now)
  }
  const earlier = (r: (typeof rows)[number]) => (others ?? []).filter((o) => o.contact_id === r.contact_id && o.id !== r.id)
  const typeName = (id: string) => types?.find((x) => x.id === id)?.name ?? ""
  return (
    <>
      <PageHeader
        area="members"
        title={status === "trash" ? `${t("membership.tabs.members")} · ${t("membership.filters.trash")}` : t("membership.tabs.members")}
        meta={t("membership.activeCount", { count: activeCount ?? 0 })}
        settings={canManage && { href: "/members/settings", label: t("common.settings") }}
        menu={
          <ActionsMenu>
            {canManage && (
              <MenuLink href={withParams(sp, { import: "1" })} icon={<UploadIcon />}>
                {t("membership.import")}
              </MenuLink>
            )}
            <MenuExport entity="members" query={{ status, type: typeFilter, q }} />
            {canManage && (
              <>
                <MenuSeparator />
                <MenuLink href={trash ? "/members" : "/members?trash=1"} icon={trash ? <IdCardIcon /> : <Trash2Icon />}>
                  {status === "trash" ? t("membership.filters.active") : t("membership.filters.trash")}
                </MenuLink>
              </>
            )}
          </ActionsMenu>
        }
        primary={canManage && !!types?.length && status !== "trash" ? { href: "/members/new", label: t("membership.new") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {(!!anyCount || trash) && (
        <ListToolbar search={<SearchBox q={q} label={t("common.search")} keep={{ ...(status !== "active" && !trash && { status }), ...(trash && { trash: "1" }), ...(typeFilter && { type: typeFilter }) }} />}>
          {!trash && (
            <Segments
              label={t("membership.filter")}
              items={(["active", "ended", "all"] as const).map((s) => ({ href: `/members${withParams(sp, { status: s === "active" ? undefined : s, page: undefined })}`, current: s === status, label: t(`membership.filters.${s}`) }))}
            />
          )}
          {(types?.length ?? 0) > 1 && <FilterMenu param="type" label={t("membership.type")} options={(types ?? []).map((x) => ({ value: x.id, label: x.name }))} />}
        </ListToolbar>
      )}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/members/${r.id}`}
        select={status !== "trash" ? { form: "bulk-members", label: t("common.select") } : undefined}
        empty={
          trash ? (
            t("contacts.emptyTrash")
          ) : anyCount ? (
            t("membership.noMatch")
          ) : !types?.length ? (
            <EmptyState
              area="members"
              title={t("membership.noTypesTitle")}
              text={t("membership.noTypes")}
              action={
                canManage && (
                  <Button render={<Link href="/members/settings?new=type" />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("membership.newType")}
                  </Button>
                )
              }
            />
          ) : (
            <EmptyState
              area="members"
              title={t("membership.empty")}
              text={t("membership.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/members/new" />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("membership.new")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("membership.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">
                  {r.contacts ? contactName(r.contacts) : ""}
                  {r.contacts?.user_id && (
                    <Badge variant="outline" className="ml-2">
                      {t("contacts.team.badge")}
                    </Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{t("membership.numberShort", { number: r.member_no ?? "" })}</span>
                {earlier(r).length > 0 && (
                  <details className="relative z-10 text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none hover:text-foreground">{t("membership.otherPeriods", { count: earlier(r).length })}</summary>
                    <ul className="mt-1 grid gap-0.5">
                      {earlier(r).map((o) => (
                        <li key={o.id}>
                          <Link href={`/members/${o.id}`} className="underline-offset-4 hover:text-foreground hover:underline">
                            {typeName(o.type_id)} · {t.date(o.starts_on)} – {o.ends_on ? t.date(o.ends_on) : t("membership.open")}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </span>
            ),
          },
          { header: t("membership.type"), cell: (r) => typeName(r.type_id) },
          { header: t("membership.since"), cell: (r) => t.date(r.starts_on), className: "whitespace-nowrap", phone: false },
          { header: t("membership.status"), cell: (r) => <MemberStateBadge t={t} m={r} now={now} /> },
          {
            header: t("membership.paidUntilCol"),
            cell: (r) => <span className={behind(r) ? "text-destructive tabular-nums" : "tabular-nums"}>{until(r) ? t.date(until(r)!) : "–"}</span>,
            className: "whitespace-nowrap",
            phone: false,
          },
          // Phones: the paid-until date only when it needs attention.
          {
            header: t("membership.paidUntilCol"),
            cell: (r) => behind(r) && <span className="text-destructive tabular-nums">{until(r) ? `${t("membership.paidUntilCol")} ${t.date(until(r)!)}` : `${t("membership.paidUntilCol")} –`}</span>,
            table: false,
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {status !== "trash" && (
        <BulkBar form="bulk-members">
          <Button type="submit" size="sm" variant="outline" formAction="/export/members" formMethod="get" name="format" value="xlsx">
            <DownloadIcon /> {t("common.exportSelected")}
          </Button>
        </BulkBar>
      )}
      {canManage && param(sp, "import") === "1" && (
        <UrlSheet params={["import"]} title={t("membership.importTitle")} wide>
          {ctx.can("crm.manage") ? <MemberImportBody ctx={ctx} /> : <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("membership.importNeedsCrm")}</p>}
        </UrlSheet>
      )}
    </>
  )
}

export const instant = false

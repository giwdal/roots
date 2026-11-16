import { notFound } from "next/navigation"
import { DataTable, Pager, PAGE_SIZE } from "@/components/data-table"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam } from "@/lib/url"
import { contactName } from "../fields"

type Person = { id: string; first_name: string | null; last_name: string | null; company: string | null; email: string | null }

// Possible duplicates (same first + last name). Nothing merges by itself: the team opens a pair and merges it.
export default async function DuplicatesPage({ searchParams }: PageProps<"/contacts/duplicates">) {
  const ctx = await requirePerm("crm.view")
  if (!ctx.modules.has("crm")) notFound()
  const t = await getT()
  const sp = await searchParams
  const page = pageParam(sp)
  const canManage = ctx.can("crm.manage")
  const { data: pairs } = await ctx.supabase.rpc("contact_duplicates", { p_org: ctx.org.id, p_limit: PAGE_SIZE + 1, p_offset: (page - 1) * PAGE_SIZE })
  const shown = (pairs ?? []).slice(0, PAGE_SIZE)
  const ids = [...new Set(shown.flatMap((p) => [p.a_id, p.b_id]))]
  const { data: people } = ids.length
    ? await ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("org_id", ctx.org.id).in("id", ids)
    : { data: [] as Person[] }
  const byId = new Map((people ?? []).map((c) => [c.id, c]))
  const rows = shown.flatMap((p) => {
    const a = byId.get(p.a_id)
    const b = byId.get(p.b_id)
    return a && b ? [{ a, b }] : []
  })
  const person = (c: Person) => (
    <span className="grid min-w-0">
      <span className="truncate font-medium">{contactName(c)}</span>
      {c.email && <span className="truncate text-xs text-muted-foreground">{c.email}</span>}
    </span>
  )

  return (
    <Page>
      <PageHeader area="contacts" title={t("contacts.duplicates.nav")} />
      <DataTable
        rows={rows}
        rowKey={(r) => `${r.a.id}-${r.b.id}`}
        rowHref={(r) => (canManage ? `/contacts/${r.a.id}/merge?with=${r.b.id}` : `/contacts/${r.a.id}`)}
        empty={page === 1 ? <EmptyState area="contacts" title={t("contacts.duplicates.empty")} text={t("contacts.duplicates.emptyText")} /> : t("contacts.duplicates.empty")}
        columns={[
          { header: t("contacts.duplicates.a"), cell: (r) => person(r.a) },
          { header: t("contacts.duplicates.b"), cell: (r) => person(r.b) },
          ...(canManage ? [{ header: "", cell: () => <span className="text-sm text-primary">{t("contacts.duplicates.merge")}</span>, className: "text-right" }] : []),
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(pairs?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </Page>
  )
}

export const instant = false

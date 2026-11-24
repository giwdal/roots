import Link from "next/link"
import { redirect } from "next/navigation"
import { BriefcaseBusinessIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { EMPLOYMENT_TYPES } from "@/hr/fields"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { restoreEmployee } from "./actions"
import { PeopleViews } from "./views"

// Personal › Personen: who works here, on what terms. Search, employment filter, the org chart as the other view,
// the trash (?trash=1) with restore. A row opens the person's page.
export default async function HrPage({ searchParams }: PageProps<"/hr">) {
  const ctx = await requirePerm("hr.view")
  const t = await getT()
  const sp = await searchParams
  if (param(sp, "new")) redirect("/hr/new") // old drawer link
  if (param(sp, "status") === "trash") redirect(`/hr${withParams(sp, { status: undefined, trash: "1" })}`) // old trash link
  const canManage = ctx.can("hr.manage")
  const trash = canManage && param(sp, "trash") === "1"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const type = EMPLOYMENT_TYPES.find((x) => x === param(sp, "type"))
  const page = pageParam(sp)
  let query = ctx.supabase
    .from("employees")
    .select("id, name, job_title, department, employment_type, starts_on, ends_on, manager:manager_id(name)")
    .eq("org_id", ctx.org.id)
    .order("name")
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (q) query = query.or(`name.ilike.%${q}%,job_title.ilike.%${q}%,department.ilike.%${q}%,email.ilike.%${q}%`)
  if (type) query = query.eq("employment_type", type)
  const [{ data }, { count: any }] = await Promise.all([query, ctx.supabase.from("employees").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null)])
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Page>
      <PageHeader
        area="hr"
        title={trash ? `${t("hr.tabs.people")} · ${t("hr.trash")}` : t("hr.tabs.people")}
        menu={
          <ActionsMenu>
            <MenuExport entity="employees" query={{ q, type }} />
            {canManage && (
              <>
                <MenuSeparator />
                <MenuLink href={trash ? "/hr" : "/hr?trash=1"} icon={trash ? <BriefcaseBusinessIcon /> : <Trash2Icon />}>
                  {trash ? t("hr.backToList") : t("hr.trash")}
                </MenuLink>
              </>
            )}
          </ActionsMenu>
        }
        primary={canManage && !trash ? { href: "/hr/new", label: t("hr.new") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {(!!any || trash) && (
        <ListToolbar search={<SearchBox q={q} label={t("hr.search")} keep={{ ...(trash && { trash: "1" }), ...(type && { type }) }} />}>
          <FilterMenu param="type" label={t("hr.employmentType")} allLabel={t("hr.allTypes")} options={EMPLOYMENT_TYPES.map((x) => ({ value: x, label: t.dynamic(`hr.types.${x}`) }))} />
          {!trash && <PeopleViews t={t} current="list" />}
        </ListToolbar>
      )}
      {trash && <p className="text-sm text-muted-foreground">{t("hr.trashHint")}</p>}
      <DataTable
        rows={(data ?? []).slice(0, PAGE_SIZE)}
        rowKey={(e) => e.id}
        rowHref={(e) => `/hr/${e.id}`}
        empty={
          trash ? (
            t("hr.emptyTrash")
          ) : any ? (
            t("hr.noMatch")
          ) : (
            <EmptyState
              area="hr"
              title={t("hr.empty")}
              text={t("hr.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/hr/new" />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("hr.new")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("hr.name"),
            cell: (e) => (
              <span className="grid">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {e.name}
                  {e.ends_on && e.ends_on < today && <Badge variant="secondary">{t("hr.left")}</Badge>}
                </span>
                {e.job_title && <span className="text-xs font-normal text-muted-foreground">{e.job_title}</span>}
              </span>
            ),
          },
          { header: t("hr.employmentType"), cell: (e) => t.dynamic(`hr.types.${e.employment_type}`) },
          { header: t("hr.department"), cell: (e) => e.department ?? "–" },
          { header: t("hr.manager"), cell: (e) => (e.manager as { name: string } | null)?.name ?? "–" },
          trash
            ? {
                header: "",
                cell: (e) => (
                  <form action={restoreEmployee}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="return" value="/hr?trash=1" />
                    <SubmitButton size="sm" variant="outline">
                      {t("hr.restore")}
                    </SubmitButton>
                  </form>
                ),
              }
            : { header: t("hr.since"), cell: (e) => (e.starts_on ? t.date(e.starts_on, { dateStyle: "medium" }) : "–") },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </Page>
  )
}

export const instant = false

import Link from "next/link"
import { ClipboardListIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { notFound } from "next/navigation"
import { DataTable, ListToolbar, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { SaveBar } from "@/components/save-bar"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { createForm, restoreForm } from "./actions"
import { FormBadge } from "./badges"

const STATUSES = ["draft", "published", "closed"] as const

export default async function FormsPage({ searchParams }: PageProps<"/forms">) {
  const ctx = await requirePerm("forms.view")
  if (!ctx.modules.has("forms")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("forms.manage")
  const creating = canManage && param(sp, "new") === "1"
  const trash = canManage && param(sp, "trash") === "1"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const status = STATUSES.find((s) => s === param(sp, "status"))
  // ponytail: every form of the org in one list (orgs have a handful); a Pager if that changes.
  let list = ctx.supabase.from("forms").select("id, title, purpose, status, slug, updated_at").eq("org_id", ctx.org.id)
  list = trash ? list.not("deleted_at", "is", null).order("deleted_at", { ascending: false }) : list.is("deleted_at", null).order("updated_at", { ascending: false })
  if (q) list = list.ilike("title", `%${q}%`)
  if (status) list = list.eq("status", status)
  const [{ data: forms }, { data: open }, { count: any }] = await Promise.all([
    list,
    // ponytail: new-submission counts over ≤ 5000 open rows; a grouped RPC if forms get busier.
    ctx.supabase.from("form_submissions").select("form_id").eq("org_id", ctx.org.id).eq("status", "new").limit(5000),
    ctx.supabase.from("forms").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null),
  ])
  const newCount = (id: string) => open?.filter((s) => s.form_id === id).length ?? 0

  return (
    <Page>
      <PageHeader
        area="communication"
        title={trash ? `${t("forms.title")} · ${t("forms.trash")}` : t("forms.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/forms" : "/forms?trash=1"} icon={trash ? <ClipboardListIcon /> : <Trash2Icon />}>
                {trash ? t("forms.all") : t("forms.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: withParams(sp, { new: "1" }), label: t("forms.new") } : undefined}
      />
      <Notice error={!creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      {(!!any || trash) && (
        <ListToolbar search={<SearchBox q={q} label={t("common.search")} keep={{ ...(trash && { trash: "1" }), ...(status && { status }) }} />}>
          {!trash && <FilterMenu param="status" label={t("forms.status")} options={STATUSES.map((s) => ({ value: s, label: t(`forms.statuses.${s}`) }))} />}
        </ListToolbar>
      )}
      {trash && <p className="text-sm text-muted-foreground">{t("forms.trashHint", { days: 30 })}</p>}
      <DataTable
        rows={forms ?? []}
        rowKey={(r) => r.id}
        rowHref={trash ? undefined : (r) => `/forms/${r.id}`}
        empty={
          trash ? (
            t("forms.emptyTrash")
          ) : any ? (
            t("forms.noMatch")
          ) : (
            <EmptyState
              area="communication"
              title={t("forms.empty")}
              text={t("forms.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href={withParams(sp, { new: "1" })} scroll={false} />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("forms.new")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("forms.formTitle"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{r.title}</span>
                <span className="text-xs text-muted-foreground">{t.dynamic(`forms.purposes.${r.purpose}`)}</span>
              </span>
            ),
          },
          { header: t("forms.status"), cell: (r) => <FormBadge t={t} status={r.status} /> },
          {
            header: trash ? "" : t("forms.newSubmissions"),
            cell: (r) =>
              trash ? (
                <form action={restoreForm}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="sm" variant="outline">
                    {t("forms.restore")}
                  </SubmitButton>
                </form>
              ) : newCount(r.id) ? (
                <Badge variant="warning">{t("forms.newCount", { count: newCount(r.id) })}</Badge>
              ) : (
                <span className="text-muted-foreground">–</span>
              ),
          },
        ]}
      />
      {creating && (
        <UrlSheet params={["new"]} title={t("forms.new")}>
          <Notice error={param(sp, "error")} />
          <form action={createForm} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="f-title">{t("forms.formTitle")}</Label>
              <Input id="f-title" name="title" required maxLength={200} placeholder={t("forms.titlePlaceholder")} />
            </div>
            {ctx.modules.has("members") && (
              <div className="grid gap-2">
                <Label htmlFor="f-purpose">{t("forms.purpose")}</Label>
                <Choice
                  id="f-purpose"
                  name="purpose"
                  label={t("forms.purpose")}
                  required
                  defaultValue="membership"
                  options={(["contact", "membership"] as const).map((p) => ({ value: p, label: t(`forms.purposes.${p}`) }))}
                />
                <p className="text-xs text-muted-foreground">{t("forms.purposeHint")}</p>
              </div>
            )}
            <SaveBar label={t("forms.createForm")} always />
          </form>
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false

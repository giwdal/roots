import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArchiveRestoreIcon, BookOpenIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { ListToolbar, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Section } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { restorePageAction } from "./actions"
import { TreeNav } from "./tree-nav"
import { TreeSheet } from "./tree-sheet"

// Wiki start: the page tree (left on desktop, a "Seiten" sheet on phones), search over titles and texts, recently
// changed pages; the trash (?trash=1) lists deleted pages with restore.
export default async function WikiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("wiki.view")
  if (!ctx.modules.has("wiki")) notFound()
  const t = await getT()
  const sp = await searchParams
  if (param(sp, "status") === "trash") redirect("/wiki?trash=1") // old trash link
  const canManage = ctx.can("wiki.manage")
  const trash = canManage && param(sp, "trash") === "1"
  const q = param(sp, "q")?.replace(/[%,()*\\]/g, " ").trim()
  let list = ctx.supabase.from("wiki_pages").select("id, icon, title, body, updated_at, deleted_at").eq("org_id", ctx.org.id).order(trash ? "deleted_at" : "updated_at", { ascending: false }).limit(q || trash ? 50 : 15)
  list = trash ? list.not("deleted_at", "is", null) : list.is("deleted_at", null)
  if (q) list = list.or(`title.ilike.%${q}%,body.ilike.%${q}%`)
  const [{ data: rows }, { data: pages }] = await Promise.all([
    ctx.supabase.from("wiki_pages").select("id, parent_id, icon, title, position, visibility").eq("org_id", ctx.org.id).is("deleted_at", null).limit(2000),
    list,
  ])
  // A snippet around the hit (plain text: images and file addresses out, links as their text, Markdown marks out).
  const snippet = (body: string) => {
    const text = body
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[#*_>`|[\]()-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : 0
    return text.slice(Math.max(0, at - 60), Math.max(0, at - 60) + 180)
  }
  const fresh = !trash && !q && !rows?.length

  return (
    <Page>
      <PageHeader
        area="wiki"
        title={trash ? t("wiki.trash") : t("wiki.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/wiki" : "/wiki?trash=1"} icon={trash ? <BookOpenIcon /> : <Trash2Icon />}>
                {trash ? t("wiki.backToPages") : t("wiki.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: "/wiki/new", label: t("wiki.newPage") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {fresh ? (
        <EmptyState
          area="wiki"
          title={t("wiki.emptyTitle")}
          text={t("wiki.emptyText")}
          action={
            canManage && (
              <Button render={<Link href="/wiki/new" />} nativeButton={false} size="sm">
                <PlusIcon /> {t("wiki.newPage")}
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
          <aside className="hidden rounded-xl border p-2 lg:sticky lg:top-4 lg:grid">
            <TreeNav rows={rows ?? []} label={t("wiki.tree")} />
          </aside>
          <div className="grid min-w-0 gap-6">
            <ListToolbar search={<SearchBox q={q} label={t("wiki.search")} keep={trash ? { trash: "1" } : undefined} />}>{!trash && <TreeSheet rows={rows ?? []} />}</ListToolbar>
            {trash && <p className="text-sm text-muted-foreground">{t("wiki.trashHint", { days: 30 })}</p>}
            <Section title={trash ? t("wiki.trash") : q ? t("wiki.results") : t("wiki.recent")}>
              {pages?.length ? (
                <ul className="divide-y rounded-xl border">
                  {pages.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <Link href={`/wiki/${p.id}`} className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-sm font-medium">
                          {p.icon && `${p.icon} `}
                          {p.title}
                        </span>
                        {p.body && <span className="truncate text-xs text-muted-foreground">{snippet(p.body)}</span>}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{t.date(trash ? p.deleted_at! : p.updated_at, { dateStyle: "medium" })}</span>
                      {trash && (
                        <form action={restorePageAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <SubmitButton size="sm" variant="outline">
                            <ArchiveRestoreIcon /> <span className="max-sm:sr-only">{t("wiki.restore")}</span>
                          </SubmitButton>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{q ? t("wiki.noMatch") : trash ? t("wiki.trashEmpty") : t("wiki.empty")}</p>
              )}
            </Section>
          </div>
        </div>
      )}
    </Page>
  )
}

export const instant = false

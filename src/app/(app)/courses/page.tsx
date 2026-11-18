import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeftIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { restoreCourse } from "./actions"

// Courses: next date, places taken/left, waiting list at a glance. A row opens the course; trash on ?trash=1.
export default async function CoursesPage({ searchParams }: PageProps<"/courses">) {
  const sp = await searchParams
  if (param(sp, "new")) redirect("/courses/new") // old drawer link
  if (param(sp, "status") === "trash") redirect(`/courses${withParams(sp, { status: undefined, trash: "1" })}`) // old trash link
  const ctx = await requirePerm("courses.view")
  const t = await getT()
  const canManage = ctx.can("courses.manage")
  const trash = canManage && param(sp, "trash") === "1"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const page = pageParam(sp)
  const now = new Date().toISOString()
  let query = ctx.supabase
    .from("courses")
    .select("id, title, instructor, capacity, deleted_at, course_participants(status), course_sessions(starts_at, cancelled)")
    .eq("org_id", ctx.org.id)
    .order(trash ? "deleted_at" : "title", trash ? { ascending: false } : undefined)
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (q) query = query.or(`title.ilike.%${q}%,instructor.ilike.%${q}%`)
  const [{ data }, { count: total }] = await Promise.all([query, ctx.supabase.from("courses").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id)])
  const rows = (data ?? []).slice(0, PAGE_SIZE).map((c) => {
    const upcoming = c.course_sessions.filter((s) => !s.cancelled && s.starts_at >= now).map((s) => s.starts_at).sort()
    return {
      ...c,
      next: upcoming[0] ?? null,
      enrolled: c.course_participants.filter((p) => p.status === "enrolled").length,
      waiting: c.course_participants.filter((p) => p.status === "waiting").length,
    }
  })

  return (
    <Page>
      <PageHeader
        area="courses"
        title={trash ? `${t("courses.title")} · ${t("courses.trash")}` : t("courses.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/courses" : "/courses?trash=1"} icon={trash ? <ArrowLeftIcon /> : <Trash2Icon />}>
                {trash ? t("courses.backToCourses") : t("courses.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: "/courses/new", label: t("courses.new") } : undefined}
      />
      {trash && <p className="text-sm text-muted-foreground">{t("courses.trashHint", { days: 30 })}</p>}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {(!!total || trash) && <ListToolbar search={<SearchBox q={q} label={t("courses.search")} keep={trash ? { trash: "1" } : undefined} />} />}
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        rowHref={trash ? undefined : (c) => `/courses/${c.id}`}
        empty={
          trash ? (
            t("courses.emptyTrash")
          ) : q || total ? (
            t("courses.noMatch")
          ) : (
            <EmptyState
              area="courses"
              title={t("courses.empty")}
              text={t("courses.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/courses/new" />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("courses.new")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("courses.titleLabel"),
            cell: (c) => (
              <span className="grid">
                <span className="font-medium">{c.title}</span>
                {c.instructor && <span className="text-xs text-muted-foreground">{c.instructor}</span>}
              </span>
            ),
          },
          trash
            ? {
                header: t("courses.status"),
                cell: (c) => (
                  <form action={restoreCourse}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton size="sm" variant="outline">
                      {t("courses.restore")}
                    </SubmitButton>
                  </form>
                ),
              }
            : { header: t("courses.nextDate"), cell: (c) => (c.next ? t.date(c.next, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–") },
          {
            header: t("courses.places"),
            cell: (c) => (
              <span className="flex flex-wrap items-center gap-2 tabular-nums">
                {c.capacity ? `${c.enrolled} / ${c.capacity}` : c.enrolled}
                {c.capacity != null && c.enrolled >= c.capacity && <Badge variant="warning">{t("courses.full")}</Badge>}
                {c.waiting > 0 && <Badge variant="info">{t("courses.waitingCount", { count: c.waiting })}</Badge>}
              </span>
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </Page>
  )
}

export const instant = false

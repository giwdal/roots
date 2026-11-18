import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon } from "lucide-react"
import { contactName } from "@/app/(app)/contacts/fields"
import { ActionsMenu, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { AttendanceList } from "../../../attendance-list"
import { SessionForms, SessionMenuItems, SessionSheet } from "../../../session-sheet"

// One date of a course = taking attendance (phone first): tap the names of who is there, each tap saves; ‹ › walk to
// the neighbouring dates. The date's own fields are a sheet (?edit=date); fällt aus / löschen are ⋯ actions that ask.
// Courses without attendance have nothing here: their dates are a sheet on the course page.
export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string; sessionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, sessionId } = await params
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(sessionId)) notFound()
  const ctx = await requirePerm("courses.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("courses.manage")
  const [{ data: s }, { data: people }, { data: marks }, { data: dates }] = await Promise.all([
    ctx.supabase.from("course_sessions").select("id, course_id, starts_at, ends_at, note, cancelled, courses(title, track_attendance)").eq("id", sessionId).eq("course_id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("course_participants").select("id, contacts(first_name, last_name, company, email)").eq("course_id", id).eq("org_id", ctx.org.id).eq("status", "enrolled").order("created_at"),
    ctx.supabase.from("course_attendance").select("participant_id, present").eq("session_id", sessionId).eq("org_id", ctx.org.id),
    ctx.supabase.from("course_sessions").select("id, starts_at").eq("course_id", id).eq("org_id", ctx.org.id).order("starts_at"),
  ])
  if (!s || !s.courses) notFound()
  if (!s.courses.track_attendance) redirect(`/courses/${id}?edit=${sessionId}`)
  const all = dates ?? []
  const at = all.findIndex((d) => d.id === sessionId)
  const prev = at > 0 ? all[at - 1] : undefined
  const next = at >= 0 ? all[at + 1] : undefined
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const isToday = new Date(s.starts_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) === today
  const title = t.date(s.starts_at, { weekday: "long", day: "numeric", month: "long" })
  const time = `${t.date(s.starts_at, { hour: "2-digit", minute: "2-digit" })}–${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`
  const short = (v: string) => t.date(v, { day: "numeric", month: "short" })
  const editing = param(sp, "edit") === "date"
  const session = { id: s.id, course_id: s.course_id, starts_at: s.starts_at, ends_at: s.ends_at, note: s.note, cancelled: s.cancelled }

  return (
    <Page size="form">
      <PageHeader
        crumbs={[{ href: "/courses", label: t("courses.title") }, { href: `/courses/${id}#dates`, label: s.courses.title }, { label: title }]}
        title={title}
        badge={s.cancelled ? <Badge variant="secondary">{t("courses.cancelledDate")}</Badge> : isToday ? <Badge variant="info">{t("courses.today")}</Badge> : undefined}
        meta={[time, s.note].filter(Boolean).join(" · ")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={withParams(sp, { edit: "date" })} icon={<PencilIcon />}>
                {t("courses.editDate")}
              </MenuLink>
              <MenuSeparator />
              <SessionMenuItems t={t} s={session} />
            </ActionsMenu>
          )
        }
      />
      {canManage && <SessionForms s={session} from="session" />}
      <Notice error={!editing ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      <div className="flex items-center justify-between gap-2">
        {prev ? (
          <Button render={<Link href={`/courses/${id}/sessions/${prev.id}`} />} nativeButton={false} size="sm" variant="ghost">
            <ChevronLeftIcon /> {short(prev.starts_at)}
          </Button>
        ) : (
          <span />
        )}
        {next && (
          <Button render={<Link href={`/courses/${id}/sessions/${next.id}`} />} nativeButton={false} size="sm" variant="ghost">
            {short(next.starts_at)} <ChevronRightIcon />
          </Button>
        )}
      </div>

      {s.cancelled ? (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("courses.dateIsCancelled")}</p>
      ) : !people?.length ? (
        <p className="text-sm text-muted-foreground">{t("courses.noParticipants")}</p>
      ) : (
        <AttendanceList
          sessionId={sessionId}
          people={people.map((p) => ({ id: p.id, name: p.contacts ? contactName(p.contacts) : "–" }))}
          present={(marks ?? []).filter((m) => m.present).map((m) => m.participant_id)}
          canManage={canManage}
        />
      )}

      {editing && <SessionSheet t={t} s={session} from="session" param="edit" error={param(sp, "error")} canManage={canManage} />}
    </Page>
  )
}

export const instant = false

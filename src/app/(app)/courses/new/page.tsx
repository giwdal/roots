import { notFound } from "next/navigation"
import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { toLocalInput } from "@/lib/time"
import { param, type SearchParams } from "@/lib/url"
import { CourseForm } from "../course-form"

// New course; ?start= (the calendar's "Neu am …", an ISO time) pre-fills the first date (90 minutes).
export default async function NewCoursePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("courses.manage")
  if (!ctx.modules.has("courses")) notFound()
  const t = await getT()
  const sp = await searchParams
  const start = param(sp, "start")
  const at = start && !Number.isNaN(Date.parse(start)) ? new Date(start) : null
  const end = param(sp, "end")
  const until = at && end && Date.parse(end) > at.getTime() ? new Date(end) : at ? new Date(at.getTime() + 90 * 60_000) : null
  const { data: locations } = await ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name")
  return (
    <NewPage list={{ href: "/courses", label: t("courses.nav") }} title={t("courses.new")} error={param(sp, "error")}>
      <CourseForm t={t} locations={locations ?? []} first={at && until ? { start: toLocalInput(at.toISOString()), end: toLocalInput(until.toISOString()) } : null} />
    </NewPage>
  )
}

export const instant = false

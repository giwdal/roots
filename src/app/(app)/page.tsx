import { HouseIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { SproutAsk } from "@/components/sprout/ask"
import { SproutOrb } from "@/components/sprout/sprout-orb"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { titled } from "@/lib/title"
import { APP_HOME, param } from "@/lib/url"
import { TaskDrawer } from "./projects/task-drawer"

export const generateMetadata = titled("shell.home")

// Start, per person, kept quiet on purpose (user, 19 Nov): Sprout in the middle as the way to ask or do anything.
// Shifts, tasks, counts and notifications live in their areas (Meine Schichten, the inbox in the menu).
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const now = new Date()
  const { data: me } = await ctx.supabase.from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle()
  const first = me?.full_name?.split(" ")[0]

  return (
    <Page size="form">
      <PageHeader icon={HouseIcon} title={t("shell.home")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {/* Sprout in the middle: the greeting, then one field to ask or get something done. */}
      <section aria-labelledby="home-hi" className="grid justify-items-center gap-4 pt-4 text-center md:pt-10">
        <SproutOrb size={44} still className="text-foreground" label="Sprout" />
        <div className="grid gap-1">
          <h2 id="home-hi" className="text-xl font-semibold tracking-tight">
            {first ? t("home.hello", { name: first }) : t("home.helloPlain")}
          </h2>
          <p className="text-sm text-muted-foreground">{t.date(now.toISOString(), { dateStyle: "full" })} · {ctx.org.name}</p>
        </div>
        <div className="w-full text-left">
          <SproutAsk />
        </div>
      </section>

      <TaskDrawer ctx={ctx} t={t} id={param(sp, "task")} back={APP_HOME} error={param(sp, "error")} ok={param(sp, "ok")} />
    </Page>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false

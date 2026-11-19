import { notFound } from "next/navigation"
import { NewPage } from "@/components/new-page"
import { SaveBar } from "@/components/save-bar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { newPageAction } from "../actions"

// New page: a title (optionally below ?parent=), created on "Seite anlegen" — never on opening this page.
export default async function NewWikiPage({ searchParams }: PageProps<"/wiki/new">) {
  const ctx = await requirePerm("wiki.manage")
  if (!ctx.modules.has("wiki")) notFound()
  const t = await getT()
  const sp = await searchParams
  const parentId = param(sp, "parent")
  const { data: parent } = parentId && /^[0-9a-f-]{36}$/.test(parentId) ? await ctx.supabase.from("wiki_pages").select("id, title").eq("id", parentId).eq("org_id", ctx.org.id).maybeSingle() : { data: null }
  return (
    <NewPage list={parent ? { href: `/wiki/${parent.id}`, label: parent.title } : { href: "/wiki", label: t("wiki.title") }} title={t("wiki.newPage")} error={param(sp, "error")}>
      <form action={newPageAction} className="grid gap-4">
        {parent && <input type="hidden" name="parent_id" value={parent.id} />}
        <div className="grid gap-2">
          <Label htmlFor="w-title">{t("wiki.pageTitle")}</Label>
          <Input id="w-title" name="title" maxLength={200} autoFocus placeholder={t("wiki.untitled")} />
          {parent && <p className="text-xs text-muted-foreground">{t("wiki.below", { title: parent.title })}</p>}
        </div>
        <SaveBar label={t("wiki.create")} always />
      </form>
    </NewPage>
  )
}

export const instant = false

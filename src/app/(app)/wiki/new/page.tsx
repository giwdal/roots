import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { CreatePage } from "./create"

// "+ Neue Seite" as a link (round button on phones): opens, creates the page, goes to it (?parent= for a sub-page).
export default async function NewWikiPage({ searchParams }: PageProps<"/wiki/new">) {
  await requirePerm("wiki.manage")
  const parent = param(await searchParams, "parent")
  return <CreatePage parent={parent && /^[0-9a-f-]{36}$/.test(parent) ? parent : undefined} />
}

export const instant = false

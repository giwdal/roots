import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { CreateDraft } from "./create"

// "+ Neue Rechnung" / "Neues Angebot" as a link (round button on phones, menu item): opens, creates the draft, goes
// to it. Opening the page (or a prefetch) creates nothing by itself; only the browser does, once.
export default async function NewDocumentPage({ searchParams }: PageProps<"/invoices/new">) {
  await requirePerm("invoices.manage")
  const sp = await searchParams
  const contact = param(sp, "contact")
  return <CreateDraft kind={param(sp, "kind") === "quote" ? "quote" : "invoice"} contact={contact && /^[0-9a-f-]{36}$/.test(contact) ? contact : undefined} />
}

export const instant = false

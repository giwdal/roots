import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("membership.nav")

// Mitglieder and Beiträge are sidebar items, Einstellungen is the gear (src/modules/nav.ts).
export default async function MembersLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("members.view")
  if (!ctx.modules.has("members")) notFound()
  return <div className="grid min-w-0 gap-6">{children}</div>
}

export const instant = false

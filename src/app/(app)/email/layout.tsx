import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("email.nav")

// E-Mails: campaigns, automations and the send log are views of one page (<EmailViews>); templates under the gear.
export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("email.view")
  if (!ctx.modules.has("email")) notFound()
  return <div className="grid min-w-0 gap-6">{children}</div>
}

export const instant = false

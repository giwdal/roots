import { redirect } from "next/navigation"
import { withParams } from "@/lib/url"

// E-Mail-Vorlagen moved to the area's Einstellungen (gear); old links keep their ?edit / ?new.
export default async function TemplatesRedirect({ searchParams }: PageProps<"/email/templates">) {
  const sp = await searchParams
  redirect(`/email/settings${withParams(sp, {})}`)
}

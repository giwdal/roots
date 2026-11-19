import { SectionNav } from "@/components/section-nav"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { titled } from "@/lib/title"
import { areaSettings, settingsFor } from "@/settings/sections"
import { SettingsTitle } from "./section-title"

export const generateMetadata = titled("shell.settings")

// The sections beside the page in two groups, Du and Organisation (src/settings/sections.ts), only those this person
// may change. Phones: /settings lists them as rows and every section has a back chevron to it.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [ctx, t] = await Promise.all([getContext(), getT()])
  const groups = settingsFor(ctx.can, areaSettings((m) => ctx.modules.has(m), ctx.can).length > 0).map((g) => ({
    label: t.dynamic(`settings.groups.${g.key}`),
    items: g.sections.map((s) => ({ href: `/settings/${s.key}`, label: t.dynamic(`settings.tabs.${s.key}`) })),
  }))
  return (
    <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
      <SectionNav label={t("shell.settings")} groups={groups} className="max-md:hidden" />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
        <SettingsTitle />
        {children}
      </div>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false

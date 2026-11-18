import { AreaIcon } from "@/components/area-icon"
import { LinkRows } from "@/components/link-rows"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { areaSettings } from "@/settings/sections"

// Each area keeps its own settings behind the gear in its header; this lists them all in one place.
export default async function AreaSettings() {
  const ctx = await getContext()
  const t = await getT()
  const areas = areaSettings((m) => ctx.modules.has(m), ctx.can)
  return (
    <section className="grid gap-2">
      <p className="px-1 text-sm text-muted-foreground">{t("settings.areasIntro")}</p>
      {areas.length ? (
        <LinkRows
          rows={areas.map((a) => ({
            key: a.href,
            href: a.href,
            title: (
              <span className="flex items-center gap-3">
                <AreaIcon area={a.key} icon={a.icon} />
                {t.dynamic(a.label)}
              </span>
            ),
            // An area with more than one page under its gear (Schichten: Einstellungen, Team) names the page.
            detail: a.page !== "common.settings" ? t.dynamic(a.page) : undefined,
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("settings.areasNone")}</p>
      )}
    </section>
  )
}

export const instant = false

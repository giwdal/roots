import Link from "next/link"
import { setPreference } from "@/app/account/actions"
import { ActionSwitch } from "@/components/action-switch"
import { RowGroup } from "@/components/section"
import { emailConfigured } from "@/events/channels/email"
import { eventTypes, personChannels } from "@/events/registry"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { areaOfModule, NAV } from "@/modules/nav"

const order = (k: string) => {
  const i = NAV.findIndex((a) => a.key === k)
  return i < 0 ? NAV.length + (k === "org" ? 0 : 1) : i
}

// Du › Benachrichtigungen: per kind of event and channel, a switch that saves on flip. Only events this person can be
// told about (module on, permission held); grouped by area. The org's webhooks / Telegram live in Integrationen.
export default async function NotificationSettings() {
  const ctx = await getContext()
  const t = await getT()
  const { data: prefs } = await ctx.supabase.from("notification_preferences").select("event_type, channel, enabled").eq("user_id", ctx.userId)
  const types = eventTypes.filter(
    (e) =>
      e.audience &&
      (e.audience.platform ? ctx.isPlatformAdmin : e.module === "org" || ctx.modules.has(e.module)) &&
      (!e.audience.permission || ctx.can(e.audience.permission)),
  )
  const isOn = (type: string, channel: string, defaults: string[]) => prefs?.find((p) => p.event_type === type && p.channel === channel)?.enabled ?? defaults.includes(channel)
  // Grouped by the sidebar's areas (Events, Shop, Finanzen …), in sidebar order; org / platform events after them.
  const groupOf = (m: string) => (m === "org" || m === "platform" ? m : (areaOfModule(m)?.key ?? m))
  const keys = [...new Set(types.map((e) => groupOf(e.module)))].sort((a, b) => order(a) - order(b))
  const groups = keys.map((k) => ({ module: k, types: types.filter((e) => groupOf(e.module) === k) }))
  const groupLabel = (k: string) => {
    const area = NAV.find((a) => a.key === k)
    return k === "org" ? t("general.org") : k === "platform" ? t("admin.title") : area ? t.dynamic(area.label) : t.dynamic(`modules.${k}.name`)
  }

  return (
    <div className="grid gap-8">
      <p className="text-sm text-muted-foreground">
        {t("prefs.intro")}{" "}
        <Link href="/notifications" className="link">
          {t("prefs.openInbox")}
        </Link>
      </p>
      {groups.length ? (
        groups.map((g) => (
          <RowGroup key={g.module} title={groupLabel(g.module)}>
            {g.types.map((e) => (
              <div key={e.key} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <span className="min-w-0 flex-1 basis-48 text-sm">{t.dynamic(`events.types.${e.key}`)}</span>
                <span className="flex items-center gap-5">
                  {personChannels.map((c) => (
                    <span key={c} className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t.dynamic(`prefs.${c}`)}
                      <ActionSwitch checked={isOn(e.key, c, e.audience!.defaults)} label={`${t.dynamic(`events.types.${e.key}`)}: ${t.dynamic(`prefs.${c}`)}`} action={setPreference.bind(null, e.key, c)} refresh={false} />
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </RowGroup>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">{t("prefs.none")}</p>
      )}
      {!emailConfigured() && <p className="text-xs text-muted-foreground">{t("prefs.emailOff")}</p>}
    </div>
  )
}

export const instant = false

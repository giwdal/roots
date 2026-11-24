import { Segments } from "@/components/segments"
import type { T } from "@/i18n/translate"

const VIEWS = [
  { key: "campaigns", href: "/email" },
  { key: "automations", href: "/email/automations" },
  { key: "log", href: "/email/log" },
] as const

/** E-Mails: campaigns, automations and the send log are three views of the same area, switched here (patterns.md §7). */
export function EmailViews({ t, current }: { t: T; current: (typeof VIEWS)[number]["key"] }) {
  return <Segments label={t("email.nav")} className="md:ml-auto" items={VIEWS.map((v) => ({ href: v.href, label: t(`email.tabs.${v.key}`), current: v.key === current }))} />
}

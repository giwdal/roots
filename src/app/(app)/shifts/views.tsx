import { Segments } from "@/components/segments"
import type { T } from "@/i18n/translate"

/** Plan (everyone's shifts) and Meine (the person's own day) are two views of Schichten (patterns.md §7). */
export function PlanViews({ t, current }: { t: T; current: "plan" | "me" }) {
  return (
    <Segments
      label={t("shifts.nav")}
      className="md:ml-auto"
      items={[
        { href: "/shifts", label: t("shifts.tabs.plan"), current: current === "plan" },
        { href: "/shifts/me", label: t("shifts.tabs.mine"), current: current === "me" },
      ]}
    />
  )
}

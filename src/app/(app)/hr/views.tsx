import { Segments } from "@/components/segments"
import type { T } from "@/i18n/translate"

/** Personen as a list or as the org chart: two views of the same people (patterns.md §7). */
export function PeopleViews({ t, current }: { t: T; current: "list" | "chart" }) {
  return (
    <Segments
      label={t("hr.tabs.people")}
      className="md:ml-auto"
      items={[
        { href: "/hr", label: t("hr.views.list"), current: current === "list" },
        { href: "/hr/chart", label: t("hr.views.chart"), current: current === "chart" },
      ]}
    />
  )
}

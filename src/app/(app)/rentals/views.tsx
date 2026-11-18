import { Segments } from "@/components/segments"
import type { T } from "@/i18n/translate"

/** Vergaben as a list or as the calendar (Belegung): two views of the same rentals (patterns.md §7). */
export function RentalViews({ t, current }: { t: T; current: "list" | "calendar" }) {
  return (
    <Segments
      label={t("rentals.tabs.rentals")}
      className="md:ml-auto"
      items={[
        { href: "/rentals/list", label: t("rentals.viewList"), current: current === "list" },
        { href: "/rentals/list/calendar", label: t("rentals.viewCalendar"), current: current === "calendar" },
      ]}
    />
  )
}

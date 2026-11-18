import { redirect } from "next/navigation"
import { withParams } from "@/lib/url"

// Belegung moved under Vergaben (view switch Liste · Kalender); old links keep their view/date.
export default async function OldRentalCalendar({ searchParams }: PageProps<"/rentals/calendar">) {
  redirect(`/rentals/list/calendar${withParams(await searchParams, {})}`)
}
